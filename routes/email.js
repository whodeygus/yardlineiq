const express = require('express');
const { createClient } = require('redis');
const router = express.Router();

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on('error', (err) => console.log('Redis Client Error', err));

// Connect to Redis
redis.connect();

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    const emailLower = email.toLowerCase();
    const emailEntry = {
      email: emailLower,
      signupDate: new Date().toISOString(),
      timestamp: Date.now()
    };
    
    // Store email data in Redis
    await redis.set(`email:${emailLower}`, JSON.stringify(emailEntry));
    
    // Add to list of all emails
    await redis.sadd('all_emails', emailLower);
    
    console.log(`New email saved to Redis: ${email}`);
    
    res.json({ 
      success: true,
      message: 'You have been successfully registered for this week\'s Free Pick! Email will be sent out prior to the game. Thank you and Good Luck!'
    });
  } catch (error) {
    console.error('Email signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Get email list
router.get('/email-list', async (req, res) => {
  try {
    // Get all email addresses
    const allEmails = await redis.smembers('all_emails');
    const emailDetails = [];
    
    // Get details for each email
    for (const email of allEmails) {
      const details = await redis.get(`email:${email}`);
      if (details) {
        emailDetails.push(JSON.parse(details));
      }
    }
    
    // Sort by signup date (newest first)
    emailDetails.sort((a, b) => new Date(b.signupDate) - new Date(a.signupDate));
    
    res.json({ 
      emails: emailDetails.map(entry => ({
        email: entry.email,
        signupDate: new Date(entry.signupDate)
      })),
      total: emailDetails.length 
    });
  } catch (error) {
    console.error('Failed to load email list:', error);
    res.status(500).json({ error: 'Failed to load emails' });
  }
});

// Export emails (WITHOUT deleting them)
router.get('/export-emails', async (req, res) => {
  try {
    // Get all email addresses
    const allEmails = await redis.smembers('all_emails');
    const emailDetails = [];
    
    // Get details for each email
    for (const email of allEmails) {
      const details = await redis.get(`email:${email}`);
      if (details) {
        emailDetails.push(JSON.parse(details));
      }
    }
    
    // Sort by signup date (newest first)
    emailDetails.sort((a, b) => new Date(b.signupDate) - new Date(a.signupDate));
    
    const csvContent = 'Email,Signup Date\n' + 
      emailDetails.map(entry => `${entry.email},${entry.signupDate}`).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="yardline-emails.csv"');
    res.send(csvContent);
    
    console.log(`Exported ${emailDetails.length} emails (kept in system)`);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export emails' });
  }
});

module.exports = router;
