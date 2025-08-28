const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

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

// Simple storage
let users = [{ 
  email: 'gustin.puckett@gmail.com', 
  name: 'Gustin Puckett', 
  date: new Date().toISOString(),
  type: 'email_signup'
}];
let payments = [];

// Admin authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-authenticated' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
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

// Handle email signups
app.post('/api/email/*', (req, res) => {
  console.log('Email signup request:', req.body);
  
  const email = req.body.email || req.body.Email;
  const name = req.body.name || req.body.Name || '';
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: true, message: 'Already signed up!' });
  }
  
  users.push({ 
    email, 
    name, 
    date: new Date().toISOString(),
    type: 'email_signup'
  });
  
  console.log('User added:', email, 'Total users:', users.length);
  
  res.json({ success: true, message: 'Signed up successfully!' });
});

// Create real Stripe payment intent
app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    console.log('Creating payment intent:', req.body);
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('No Stripe key found');
      return res.status(500).json({ error: 'Payment system not configured' });
    }
    
    const { amount, packageType, customerInfo } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round((amount || 29) * 100),
      currency: 'usd',
      metadata: {
        packageType: packageType || 'weekly',
        customerEmail: customerInfo?.email || '',
        customerName: customerInfo?.name || ''
      }
    });
    
    console.log('Stripe payment intent created:', paymentIntent.id);
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
    
  } catch (error) {
    console.error('Stripe error:', error.message);
    res.status(500).json({ error: 'Payment setup failed: ' + error.message });
  }
});

// Handle payment success
app.post('/api/payments/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    console.log('Payment success for:', paymentIntentId);
    
    // Verify with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not completed' });
    }
    
    // Record payment
    payments.push({
      id: paymentIntentId,
      customerInfo,
      packageType,
      amount: paymentIntent.amount / 100,
      date: new Date().toISOString()
    });
    
    // Update user
    if (customerInfo?.email) {
      let user = users.find(u => u.email === customerInfo.email);
      if (user) {
        user.type = 'paid';
        user.packageType = packageType;
      } else {
        users.push({
          email: customerInfo.email,
          name: customerInfo.name || '',
          date: new Date().toISOString(),
          type: 'paid',
          packageType
        });
      }
    }
    
    console.log('Payment processed successfully. Total users:', users.length);
    
    res.json({ success: true, message: 'Payment successful!' });
    
  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Admin stats (protected)
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const stats = {
    totalUsers: users.length,
    emailSignups: users.filter(u => u.type === 'email_signup').length,
    paidSubscribers: users.filter(u => u.type === 'paid').length,
    totalPicks: 0,
    overallWinRate: 61
  };
  console.log('Stats requested:', stats);
  res.json(stats);
});

// Get users (protected)
app.get('/api/users', requireAuth, (req, res) => {
  console.log('Users requested, returning', users.length, 'users');
  res.json(users);
});

// Export users as CSV (protected)
app.get('/api/export/users', requireAuth, (req, res) => {
  try {
    // Create CSV content
    const csvHeader = 'Email,Name,Date,Type,Package Type\n';
    const csvRows = users.map(user => {
      const email = user.email || '';
      const name = (user.name || '').replace(/,/g, ';'); // Replace commas with semicolons
      const date = user.date || '';
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

// Serve admin page with authentication
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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
  console.log('Initial users:', users.length);
  console.log('Admin password:', ADMIN_PASSWORD);
});

module.exports = app;
