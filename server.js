const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

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
  date: new Date().toISOString() 
}];

// Handle ALL possible email endpoints
app.post('/api/email/*', (req, res) => {
  console.log('Email signup:', req.body);
  
  const email = req.body.email || req.body.Email;
  const name = req.body.name || req.body.Name || '';
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: true, message: 'Already signed up!' });
  }
  
  users.push({ email, name, date: new Date().toISOString() });
  console.log('Added user:', email);
  
  res.json({ success: true, message: 'Signed up successfully!' });
});

// Basic payment endpoint (no Stripe integration for now)
app.post('/api/payments/*', (req, res) => {
  console.log('Payment request:', req.body);
  res.json({ 
    clientSecret: 'pi_test_fake_secret_123',
    paymentIntentId: 'pi_test_' + Date.now()
  });
});

// Admin endpoints
app.get('/api/admin/stats', (req, res) => {
  res.json({
    totalUsers: users.length,
    emailSignups: users.length,
    paidSubscribers: 0,
    totalPicks: 0,
    overallWinRate: 61
  });
});

app.get('/api/users', (req, res) => {
  res.json(users);
});

// Serve pages
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
  console.log('Users:', users.length);
});

module.exports = app;
