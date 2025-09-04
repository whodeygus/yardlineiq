const express = require('express');
const { kv } = require('@vercel/kv');
const router = express.Router();

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    const emailLower = email.toLowerCase();
    const timestamp = Date.now();
    const emailEntry = {
      email: emailLower,
      signupDate: new Date().toISOString(),
      timestamp: timestamp
    };
    
    // Store in Vercel KV using email as key
    await kv.set(`email:${emailLower}`, emailEntry);
    
    // Also maintain a list of all email keys for easy retrieval
    const existingEmails = await kv.get('all_emails') || [];
    if (!existingEmails.includes(emailLower)) {
      existingEmails.push(emailLower);
      await kv.set('all_emails', existingEmails);
    }
    
    console.log(`New email saved to Vercel KV: ${email}`);
    
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
    const allEmails = await kv.get('all_emails') || [];
    const emailDetails = [];
    
    // Get details for each email
    for (const email of allEmails) {
      const details = await kv.get(`email:${email}`);
      if (details) {
        emailDetails.push(details);
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
    const allEmails = await kv.get('all_emails') || [];
    const emailDetails = [];
    
    // Get details for each email
    for (const email of allEmails) {
      const details = await kv.get(`email:${email}`);
      if (details) {
        emailDetails.push(details);
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
