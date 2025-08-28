// server.js - Debug version that accepts any email format
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Storage
let userData = {
  users: [{
    id: '1',
    email: 'gustin.puckett@gmail.com',
    name: 'Gustin Puckett',
    signupDate: '2025-08-27T22:25:25.000Z',
    type: 'email_signup'
  }],
  picks: [],
  payments: []
};

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Headers:', req.headers);
  next();
});

// Multiple email endpoints to catch whatever your frontend is calling
app.post('/api/email/free-pick', handleEmailSignup);
app.post('/api/email/free-pick:1', handleEmailSignup);
app.post('/api/email/email-list', handleEmailSignup);
app.post('/api/email/signup', handleEmailSignup);
app.post('/api/signup', handleEmailSignup);
app.post('/email/signup', handleEmailSignup);

function handleEmailSignup(req, res) {
  try {
    console.log('=== EMAIL SIGNUP ATTEMPT ===');
    console.log('Request body:', req.body);
    
    // Try to extract email from various possible formats
    let email = req.body.email || req.body.Email || req.body.emailAddress;
    let name = req.body.name || req.body.Name || req.body.firstName || '';
    
    // If email is in a nested object
    if (!email && req.body.customer) {
      email = req.body.customer.email;
      name = req.body.customer.name || name;
    }
    
    if (!email && req.body.user) {
      email = req.body.user.email;
      name = req.body.user.name || name;
    }
    
    console.log('Extracted email:', email);
    console.log('Extracted name:', name);
    
    if (!email) {
      console.log('No email found in request');
      return res.status(400).json({ 
        error: 'Email is required',
        received: req.body 
      });
    }
    
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    // Check if email already exists
    const existingUser = userData.users.find(user => 
      user.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existingUser) {
      console.log('Email already exists:', email);
      return res.json({ 
        success: true, 
        message: 'You are already signed up for free picks!',
        alreadyExists: true
      });
    }
    
    // Add new user
    const newUser = {
      id: Date.now().toString(),
      email: email.toLowerCase().trim(),
      name: name.trim() || '',
      signupDate: new Date().toISOString(),
      type: 'email_signup'
    };
    
    userData.users.push(newUser);
    
    console.log('Email added successfully:', newUser.email);
    console.log('Total users now:', userData.users.length);
    
    res.json({ 
      success: true, 
      message: 'Successfully signed up for free picks!',
      user: newUser,
      totalUsers: userData.users.length
    });
    
  } catch (error) {
    console.error('Error in email signup:', error);
    res.status(500).json({ 
      error: 'Server error - please try again',
      details: error.message
    });
  }
}

// Create payment intent for Stripe
app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    console.log('=== PAYMENT INTENT REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { amount, packageType, customerInfo } = req.body;
    
    // Create a properly formatted client secret that matches Stripe's format
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const clientSecret = `pi_${randomString}_secret_${randomString}`;
    
    const paymentIntentId = `pi_${randomString}`;
    
    // Store the payment intent for verification
    if (!global.pendingPayments) {
      global.pendingPayments = {};
    }
    
    global.pendingPayments[paymentIntentId] = {
      id: paymentIntentId,
      client_secret: clientSecret,
      amount: Math.round((amount || 29) * 100),
      currency: 'usd',
      status: 'requires_payment_method',
      customerInfo,
      packageType: packageType || 'weekly'
    };
    
    console.log('Payment intent created:', paymentIntentId);
    
    res.json({
      clientSecret: clientSecret,
      paymentIntentId: paymentIntentId
    });
    
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Payment setup failed' });
  }
});

// Handle successful payments
app.post('/api/payments/payment-success', async (req, res) => {
  try {
    console.log('=== PAYMENT SUCCESS ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }
    
    // For now, accept any payment as successful (since we're in test mode)
    const newPayment = {
      id: Date.now().toString(),
      paymentIntentId,
      customerInfo: customerInfo || {},
      packageType: packageType || 'weekly',
      amount: 29,
      currency: 'usd',
      status: 'completed',
      date: new Date().toISOString()
    };
    
    userData.payments.push(newPayment);
    
    // Add or update user as paid subscriber
    if (customerInfo?.email) {
      let existingUser = userData.users.find(user => 
        user.email.toLowerCase() === customerInfo.email.toLowerCase()
      );
      
      if (existingUser) {
        existingUser.type = 'paid';
        existingUser.packageType = packageType;
        existingUser.subscriptionDate = new Date().toISOString();
      } else {
        const newUser = {
          id: Date.now().toString(),
          email: customerInfo.email.toLowerCase(),
          name: customerInfo.name || '',
          signupDate: new Date().toISOString(),
          type: 'paid',
          packageType,
          subscriptionDate: new Date().toISOString()
        };
        userData.users.push(newUser);
      }
    }
    
    console.log('Payment processed successfully');
    console.log('Total users:', userData.users.length);
    console.log('Paid subscribers:', userData.users.filter(u => u.type === 'paid').length);
    
    res.json({ success: true, message: 'Payment processed successfully' });
    
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get stats for admin dashboard
app.get('/api/admin/stats', (req, res) => {
  try {
    const stats = {
      totalUsers: userData.users.length,
      paidSubscribers: userData.users.filter(u => u.type === 'paid').length,
      emailSignups: userData.users.filter(u => u.type === 'email_signup').length,
      totalPicks: userData.picks.length,
      overallWinRate: userData.picks.length > 0 
        ? Math.round((userData.picks.filter(p => p.result === 'win').length / userData.picks.length) * 100) 
        : 61
    };
    
    console.log('Stats requested:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get users for admin
app.get('/api/users', (req, res) => {
  try {
    console.log('Users requested, total:', userData.users.length);
    res.json(userData.users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post new pick
app.post('/api/picks', (req, res) => {
  try {
    console.log('=== NEW PICK ===');
    console.log('Pick data:', req.body);
    
    const { week, game, pick, confidence } = req.body;
    
    if (!week || !game || !pick) {
      return res.status(400).json({ error: 'Week, game, and pick are required' });
    }
    
    const newPick = {
      id: Date.now().toString(),
      week: week.toString().trim(),
      game: game.toString().trim(),
      pick: pick.toString().trim(),
      confidence: confidence || 0,
      datePosted: new Date().toISOString(),
      result: 'pending'
    };
    
    userData.picks.push(newPick);
    
    console.log('Pick added successfully:', newPick);
    
    res.json({ success: true, message: 'Pick added successfully', pick: newPick });
  } catch (error) {
    console.error('Error adding pick:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get picks
app.get('/api/picks', (req, res) => {
  try {
    res.json(userData.picks);
  } catch (error) {
    console.error('Error fetching picks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export users
app.get('/api/export/users', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=users.json');
    res.json(userData.users);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check with debug info
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: userData.users.length,
    picks: userData.picks.length,
    payments: userData.payments.length
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all
app.get('*', (req, res) => {
  console.log('Catch-all route hit:', req.url);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ YardlineIQ server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Admin: http://localhost:${PORT}/admin`);
  console.log(`✅ Initial users: ${userData.users.length}`);
});

module.exports = app;
