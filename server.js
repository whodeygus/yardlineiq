const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Import Redis-enabled routes
const emailRoutes = require('./emails');
const paymentRoutes = require('./payments');

// Admin password
const ADMIN_PASSWORD = 'yardline2025';

// Basic middleware
app.use(express.json());
app.use(express.static('public'));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});

// Connect Redis-enabled routes
app.use('/api/email', emailRoutes.router);
app.use('/api/payments', paymentRoutes);

// Simple storage for picks (can be moved to Redis later if needed)
let picks = [];

// Admin authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-authenticated' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Member authentication (now uses Redis data)
app.post('/api/member/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Get users from Redis
    const emails = await emailRoutes.getAllEmails();
    const subscribers = await emailRoutes.getAllSubscribers();
    const allUsers = [...emails, ...subscribers];
    
    const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      res.json({ 
        success: true, 
        user: {
          email: user.email,
          name: user.name || 'User',
          type: user.type,
          packageType: user.packageType
        }
      });
    } else {
      res.status(401).json({ error: 'Email not found. Please sign up first.' });
    }
  } catch (error) {
    console.error('Member login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Check auth middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader === 'Bearer admin-authenticated') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Handle email signups (redirect to Redis-enabled route)
app.post('/api/email/*', (req, res) => {
  console.log('Redirecting email signup to Redis handler');
  // Forward the request to the Redis-enabled email handler
  req.url = '/free-pick';
  emailRoutes.router(req, res);
});

// Post new pick (protected)
app.post('/api/picks', requireAuth, (req, res) => {
  try {
    console.log('Pick submission:', req.body);
    
    const { week, game, time, pick, confidence, reasoning } = req.body;
    
    if (!week || !game || !pick) {
      return res.status(400).json({ error: 'Week, game, and pick are required' });
    }
    
    const newPick = {
      id: Date.now().toString(),
      week: week.toString().trim(),
      game: game.toString().trim(),
      time: time || '',
      pick: pick.toString().trim(),
      confidence: confidence || '',
      reasoning: reasoning || '',
      datePosted: new Date().toISOString(),
      result: 'pending'
    };
    
    picks.push(newPick);
    
    console.log('Pick added successfully:', newPick);
    
    res.json({ success: true, message: 'Pick posted successfully!', pick: newPick });
    
  } catch (error) {
    console.error('Error adding pick:', error);
    res.status(500).json({ error: 'Failed to post pick' });
  }
});

// Get picks for members (public access)
app.get('/api/picks', (req, res) => {
  try {
    console.log('Picks requested, returning', picks.length, 'picks');
    res.json(picks);
  } catch (error) {
    console.error('Error fetching picks:', error);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

// Admin stats (now uses Redis data)
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const emails = await emailRoutes.getAllEmails();
    const subscribers = await emailRoutes.getAllSubscribers();
    
    const stats = {
      totalUsers: emails.length + subscribers.length,
      emailSignups: emails.length,
      paidSubscribers: subscribers.length,
      totalPicks: picks.length,
      overallWinRate: 61
    };
    
    console.log('Stats requested:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get users (now uses Redis data)
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const emails = await emailRoutes.getAllEmails();
    const subscribers = await emailRoutes.getAllSubscribers();
    const allUsers = [...emails, ...subscribers];
    
    console.log('Users requested, returning', allUsers.length, 'users from Redis');
    res.json(allUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Export users as CSV (now uses Redis data)
app.get('/api/export/users', requireAuth, async (req, res) => {
  try {
    const emails = await emailRoutes.getAllEmails();
    const subscribers = await emailRoutes.getAllSubscribers();
    const allUsers = [...emails, ...subscribers];
    
    const csvHeader = 'Email,Name,Date,Type,Package Type\n';
    const csvRows = allUsers.map(user => {
      const email = user.email || '';
      const name = (user.name || '').replace(/,/g, ';');
      const date = user.signupDate || user.date || '';
      const type = user.type || 'email_signup';
      const packageType = user.packageType || '';
      
      return `"${email}","${name}","${date}","${type}","${packageType}"`;
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yardlineiq-users.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve picks page for members
app.get('/picks.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'picks.html'));
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('YardlineIQ server running on port', PORT);
  console.log('Stripe configured:', !!process.env.STRIPE_SECRET_KEY);
  console.log('Redis email system enabled');
  console.log('Admin password:', ADMIN_PASSWORD);
});

module.exports = app;
