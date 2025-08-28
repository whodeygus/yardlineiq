// server.js - Live Stripe integration for YardlineIQ
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// Debug logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Email signup - handle multiple possible endpoints
app.post('/api/email/free-pick', handleEmailSignup);
app.post('/api/email/free-pick:1', handleEmailSignup);
app.post('/api/email/email-list', handleEmailSignup);

function handleEmailSignup(req, res) {
  try {
    console.log('=== EMAIL SIGNUP ATTEMPT ===');
    
    // Extract email from various possible formats
    let email = req.body.email || req.body.Email || req.body.emailAddress;
    let name = req.body.name || req.body.Name || req.body.firstName || '';
    
    // Check nested objects
    if (!email && req.body.customer) {
      email = req.body.customer.email;
      name = req.body.customer.name || name;
    }
    
    if (!email && req.body.user) {
      email = req.body.user.email;
      name = req.body.user.name || name;
    }
    
    console.log('Email found:', email);
    
    if (!email || !email.includes('@')) {
      console.log('Invalid email provided');
      return res.status(400).json({ 
        success: false,
        error: 'Valid email is required',
        received: req.body 
      });
    }
    
    // Check if already exists
    const existingUser = userData.users.find(user => 
      user.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existingUser) {
      console.log('Email already exists');
      return res.json({ 
        success: true, 
        message: 'You are already signed up for free picks!'
      });
    }
    
    // Add new user
    const newUser = {
      id: Date.now().toString(),
      email: email.toLowerCase().trim(),
      name: name.trim(),
      signupDate: new Date().toISOString(),
      type: 'email_signup'
    };
    
    userData.users.push(newUser);
    
    console.log('SUCCESS: Email added -', newUser.email);
    console.log('Total users now:', userData.users.length);
    
    res.json({ 
      success: true, 
      message: 'Successfully signed up for free picks!',
      redirect: '/thank-you' // If your frontend expects a redirect
    });
    
  } catch (error) {
    console.error('EMAIL SIGNUP ERROR:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error - please try again'
    });
  }
}

// Create payment intent with real Stripe
app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    console.log('=== CREATING REAL STRIPE PAYMENT ===');
    console.log('Request:', JSON.stringify(req.body, null, 2));
    
    const { amount, packageType, customerInfo } = req.body;
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('ERROR: No Stripe secret key found');
      return res.status(500).json({ error: 'Payment system not configured' });
    }
    
    // Create real Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round((amount || 29) * 100), // Convert to cents
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
    console.error('STRIPE ERROR:', error);
    res.status(500).json({ 
      error: 'Payment setup failed',
      details: error.message 
    });
  }
});

// Handle payment success with real Stripe verification
app.post('/api/payments/payment-success', async (req, res) => {
  try {
    console.log('=== VERIFYING STRIPE PAYMENT ===');
    
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID required' });
    }
    
    // Verify with Stripe that payment actually succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      console.log('Payment not successful:', paymentIntent.status);
      return res.status(400).json({ error: 'Payment was not successful' });
    }
    
    console.log('Stripe payment verified:', paymentIntentId);
    
    // Save payment record
    const newPayment = {
      id: Date.now().toString(),
      paymentIntentId,
      customerInfo: customerInfo || {},
      packageType: packageType || 'weekly',
      amount: paymentIntent.amount / 100, // Convert back from cents
      currency: paymentIntent.currency,
      status: 'completed',
      date: new Date().toISOString()
    };
    
    userData.payments.push(newPayment);
    
    // Add user as paid subscriber
    if (customerInfo?.email) {
      let user = userData.users.find(u => 
        u.email.toLowerCase() === customerInfo.email.toLowerCase()
      );
      
      if (user) {
        user.type = 'paid';
        user.packageType = packageType;
        user.subscriptionDate = new Date().toISOString();
      } else {
        userData.users.push({
          id: Date.now().toString(),
          email: customerInfo.email.toLowerCase(),
          name: customerInfo.name || '',
          signupDate: new Date().toISOString(),
          type: 'paid',
          packageType,
          subscriptionDate: new Date().toISOString()
        });
      }
    }
    
    console.log('Payment processed successfully');
    
    res.json({ success: true, message: 'Payment successful!' });
    
  } catch (error) {
    console.error('PAYMENT VERIFICATION ERROR:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Get stats
app.get('/api/admin/stats', (req, res) => {
  const stats = {
    totalUsers: userData.users.length,
    paidSubscribers: userData.users.filter(u => u.type === 'paid').length,
    emailSignups: userData.users.filter(u => u.type === 'email_signup').length,
    totalPicks: userData.picks.length,
    overallWinRate: 61
  };
  res.json(stats);
});

// Get users
app.get('/api/users', (req, res) => {
  console.log('Users requested - returning', userData.users.length, 'users');
  res.json(userData.users);
});

// Post picks
app.post('/api/picks', (req, res) => {
  const { week, game, pick } = req.body;
  
  if (!week || !game || !pick) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  const newPick = {
    id: Date.now().toString(),
    week, game, pick,
    datePosted: new Date().toISOString(),
    result: 'pending'
  };
  
  userData.picks.push(newPick);
  console.log('Pick added:', newPick);
  
  res.json({ success: true, pick: newPick });
});

// Get picks
app.get('/api/picks', (req, res) => {
  res.json(userData.picks);
});

// Export users
app.get('/api/export/users', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=users.json');
  res.json(userData.users);
});

// Serve pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    users: userData.users.length,
    payments: userData.payments.length,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`YardlineIQ server running on port ${PORT}`);
  console.log('Stripe configured:', !!process.env.STRIPE_SECRET_KEY);
  console.log('Users loaded:', userData.users.length);
});

module.exports = app;
