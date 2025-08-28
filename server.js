// server.js - File-based storage with Stripe payments for YardlineIQ
// server.js - Complete YardlineIQ server with all functionality
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://yardlineiq.com', 'https://*.vercel.app'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Simple in-memory storage (persistent across requests)
let userData = {
  users: [],
  picks: [],
  payments: [],
  stats: {
    totalUsers: 0,
    paidSubscribers: 0,
    totalPicks: 0,
    emailSignups: 1, // Start with 1 since you had gustin.puckett@gmail.com
    overallWinRate: 61
  }
};

// Initialize with your existing user
userData.users.push({
  id: '1',
  email: 'gustin.puckett@gmail.com',
  name: 'Gustin Puckett',
  signupDate: '2025-08-27T22:25:25.000Z',
  type: 'email_signup'
});

// Admin password (you can change this)
const ADMIN_PASSWORD = 'yardline2025';

// Routes

// Email signup for free pick
app.post('/api/email/email-list', async (req, res) => {
  try {
    console.log('Email signup request received:', req.body);
    
    const { email, name } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    // Check if email already exists
    const existingUser = userData.users.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Add new user
    const newUser = {
      id: Date.now().toString(),
      email: email.toLowerCase().trim(),
      name: name || '',
      signupDate: new Date().toISOString(),
      type: 'email_signup'
    };
    
    userData.users.push(newUser);
    
    // Update stats
    userData.stats.totalUsers = userData.users.length;
    userData.stats.emailSignups = userData.users.filter(u => u.type === 'email_signup').length;
    
    console.log('Email added successfully:', newUser.email);
    
    res.json({ 
      success: true, 
      message: 'Successfully signed up for free picks!',
      user: newUser
    });
    
  } catch (error) {
    console.error('Error adding email:', error);
    res.status(500).json({ error: 'Server error - please try again' });
  }
});

// Create payment intent for Stripe
app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    console.log('Payment intent request:', req.body);
    
    const { amount, packageType, customerInfo } = req.body;
    
    // For testing, we'll simulate a payment intent
    // In production, you'd use: const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    const mockPaymentIntent = {
      id: `pi_test_${Date.now()}`,
      client_secret: `pi_test_${Date.now()}_secret_test123`,
      amount: Math.round((amount || 29) * 100),
      currency: 'usd',
      status: 'requires_payment_method'
    };
    
    res.json({
      clientSecret: mockPaymentIntent.client_secret,
      paymentIntentId: mockPaymentIntent.id
    });
    
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Payment setup failed' });
  }
});

// Handle successful payments
app.post('/api/payments/payment-success', async (req, res) => {
  try {
    console.log('Payment success request:', req.body);
    
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!paymentIntentId || !customerInfo?.email) {
      return res.status(400).json({ error: 'Payment info incomplete' });
    }
    
    // Save payment record
    const newPayment = {
      id: Date.now().toString(),
      paymentIntentId,
      customerInfo,
      packageType: packageType || 'weekly',
      amount: 29,
      currency: 'usd',
      status: 'completed',
      date: new Date().toISOString()
    };
    
    userData.payments.push(newPayment);
    
    // Add or update user as paid subscriber
    let existingUser = userData.users.find(user => user.email === customerInfo.email);
    
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
      userData.users.push(newUser);
    }
    
    // Update stats
    userData.stats.totalUsers = userData.users.length;
    userData.stats.paidSubscribers = userData.users.filter(u => u.type === 'paid').length;
    userData.stats.emailSignups = userData.users.filter(u => u.type === 'email_signup').length;
    
    console.log('Payment processed successfully for:', customerInfo.email);
    
    res.json({ success: true, message: 'Payment processed successfully' });
    
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Admin authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-authenticated' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Get users for admin (with auth check)
app.get('/api/users', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== 'Bearer admin-authenticated') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json(userData.users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats for admin dashboard
app.get('/api/admin/stats', (req, res) => {
  try {
    // Recalculate current stats
    userData.stats.totalUsers = userData.users.length;
    userData.stats.paidSubscribers = userData.users.filter(u => u.type === 'paid').length;
    userData.stats.emailSignups = userData.users.filter(u => u.type === 'email_signup').length;
    userData.stats.totalPicks = userData.picks.length;
    
    res.json(userData.stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post new pick
app.post('/api/picks', (req, res) => {
  try {
    const { week, game, pick, confidence } = req.body;
    
    if (!week || !game || !pick) {
      return res.status(400).json({ error: 'Week, game, and pick are required' });
    }
    
    const newPick = {
      id: Date.now().toString(),
      week: week.trim(),
      game: game.trim(),
      pick: pick.trim(),
      confidence: confidence || 0,
      datePosted: new Date().toISOString(),
      result: 'pending'
    };
    
    userData.picks.push(newPick);
    userData.stats.totalPicks = userData.picks.length;
    
    console.log('Pick added:', newPick);
    
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

// Get customer info (for payment processing)
app.get('/api/payments/customers', (req, res) => {
  try {
    const customers = userData.payments.map(p => ({
      email: p.customerInfo.email,
      name: p.customerInfo.name,
      packageType: p.packageType,
      amount: p.amount,
      date: p.date
    }));
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve admin page with simple auth
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: userData.users.length,
    picks: userData.picks.length 
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ YardlineIQ server running on port ${PORT}`);
  console.log(`✅ Admin panel: http://localhost:${PORT}/admin`);
  console.log(`✅ Stats: ${userData.users.length} users, ${userData.picks.length} picks`);
  console.log(`✅ Admin password: ${ADMIN_PASSWORD}`);
});

module.exports = app;
