// server.js - File-based storage with Stripe payments for YardlineIQ
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data storage paths
const DATA_DIR = './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PICKS_FILE = path.join(DATA_DIR, 'picks.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

// Ensure data directory exists
async function initializeDataFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Initialize files if they don't exist
    const files = [
      { path: USERS_FILE, default: [] },
      { path: PICKS_FILE, default: [] },
      { path: STATS_FILE, default: { totalUsers: 0, paidSubscribers: 0, totalPicks: 0, emailSignups: 0, winRate: 0 } },
      { path: PAYMENTS_FILE, default: [] }
    ];
    
    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
        console.log(`Created ${file.path}`);
      }
    }
  } catch (error) {
    console.error('Error initializing data files:', error);
  }
}

// Helper functions
async function readJSONFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

async function writeJSONFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

// Routes

// Email signup endpoint
app.post('/api/email/email-list', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const users = await readJSONFile(USERS_FILE);
    
    // Check if email already exists
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Add new user
    const newUser = {
      id: Date.now().toString(),
      email,
      name: name || '',
      signupDate: new Date().toISOString(),
      type: 'email_signup'
    };
    
    users.push(newUser);
    await writeJSONFile(USERS_FILE, users);
    
    // Update stats
    const stats = await readJSONFile(STATS_FILE);
    stats.totalUsers = users.length;
    stats.emailSignups = users.filter(u => u.type === 'email_signup').length;
    await writeJSONFile(STATS_FILE, stats);
    
    res.json({ success: true, message: 'Email added successfully' });
  } catch (error) {
    console.error('Error adding email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create payment intent for Stripe
app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', packageType, customerInfo } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      metadata: {
        packageType: packageType || 'unknown',
        customerEmail: customerInfo?.email || '',
        customerName: customerInfo?.name || ''
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Payment setup failed' });
  }
});

// Handle successful payments
app.post('/api/payments/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, customerInfo, packageType } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    // Save payment record
    const payments = await readJSONFile(PAYMENTS_FILE);
    const newPayment = {
      id: Date.now().toString(),
      paymentIntentId,
      customerInfo,
      packageType,
      amount: paymentIntent.amount / 100, // Convert back from cents
      currency: paymentIntent.currency,
      status: 'completed',
      date: new Date().toISOString()
    };
    
    payments.push(newPayment);
    await writeJSONFile(PAYMENTS_FILE, payments);

    // Add or update user as paid subscriber
    const users = await readJSONFile(USERS_FILE);
    let existingUser = users.find(user => user.email === customerInfo.email);
    
    if (existingUser) {
      existingUser.type = 'paid';
      existingUser.packageType = packageType;
      existingUser.subscriptionDate = new Date().toISOString();
    } else {
      const newUser = {
        id: Date.now().toString(),
        email: customerInfo.email,
        name: customerInfo.name || '',
        signupDate: new Date().toISOString(),
        type: 'paid',
        packageType,
        subscriptionDate: new Date().toISOString()
      };
      users.push(newUser);
    }
    
    await writeJSONFile(USERS_FILE, users);

    // Update stats
    const stats = await readJSONFile(STATS_FILE);
    stats.totalUsers = users.length;
    stats.paidSubscribers = users.filter(u => u.type === 'paid').length;
    stats.emailSignups = users.filter(u => u.type === 'email_signup').length;
    await writeJSONFile(STATS_FILE, stats);

    res.json({ success: true, message: 'Payment processed successfully' });

  } catch (error) {
    console.error('Error processing payment success:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get payment stats for admin
app.get('/api/payments/stats', async (req, res) => {
  try {
    const payments = await readJSONFile(PAYMENTS_FILE);
    
    const stats = {
      totalPayments: payments.length,
      totalRevenue: payments.reduce((sum, payment) => sum + payment.amount, 0),
      recentPayments: payments.slice(-10).reverse() // Last 10 payments
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching payment stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get users for admin
app.get('/api/users', async (req, res) => {
  try {
    const users = await readJSONFile(USERS_FILE);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats for admin dashboard
app.get('/api/admin/stats', async (req, res) => {
  try {
    const stats = await readJSONFile(STATS_FILE);
    const users = await readJSONFile(USERS_FILE);
    const picks = await readJSONFile(PICKS_FILE);
    
    // Calculate current stats
    const currentStats = {
      totalUsers: users.length,
      paidSubscribers: users.filter(u => u.type === 'paid').length,
      totalPicks: picks.length,
      emailSignups: users.filter(u => u.type === 'email_signup').length,
      overallWinRate: picks.length > 0 ? Math.round((picks.filter(p => p.result === 'win').length / picks.length) * 100) : 61
    };
    
    await writeJSONFile(STATS_FILE, currentStats);
    res.json(currentStats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post new pick
app.post('/api/picks', async (req, res) => {
  try {
    const { week, game, pick, confidence } = req.body;
    
    if (!week || !game || !pick) {
      return res.status(400).json({ error: 'Week, game, and pick are required' });
    }
    
    const picks = await readJSONFile(PICKS_FILE);
    
    const newPick = {
      id: Date.now().toString(),
      week,
      game,
      pick,
      confidence: confidence || 0,
      datePosted: new Date().toISOString(),
      result: 'pending' // pending, win, loss
    };
    
    picks.push(newPick);
    await writeJSONFile(PICKS_FILE, picks);
    
    res.json({ success: true, message: 'Pick added successfully', pick: newPick });
  } catch (error) {
    console.error('Error adding pick:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get picks
app.get('/api/picks', async (req, res) => {
  try {
    const picks = await readJSONFile(PICKS_FILE);
    res.json(picks);
  } catch (error) {
    console.error('Error fetching picks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export data endpoints for admin
app.get('/api/export/users', async (req, res) => {
  try {
    const users = await readJSONFile(USERS_FILE);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=users.json');
    res.json(users);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
  await initializeDataFiles();
  app.listen(PORT, () => {
    console.log(`YardlineIQ server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}

startServer().catch(console.error);
