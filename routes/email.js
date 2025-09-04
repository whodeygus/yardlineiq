const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// Simple email list storage (backup #1)
let emailList = [];

// Email transporter for notifications
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.NOTIFICATION_EMAIL, // Your Gmail
    pass: process.env.NOTIFICATION_PASSWORD // Your App Password
  }
});

// File path for permanent storage
const EMAIL_FILE_PATH = path.join(process.cwd(), 'emails-backup.json');

// Load existing emails from file on startup
async function loadEmailsFromFile() {
  try {
    const data = await fs.readFile(EMAIL_FILE_PATH, 'utf8');
    const savedEmails = JSON.parse(data);
    emailList = savedEmails;
    console.log(`Loaded ${emailList.length} emails from backup file`);
  } catch (error) {
    console.log('No existing email backup file found, starting fresh');
    emailList = [];
  }
}

// Save emails to file (backup #2)
async function saveEmailsToFile() {
  try {
    await fs.writeFile(EMAIL_FILE_PATH, JSON.stringify(emailList, null, 2));
    console.log('Emails saved to backup file');
  } catch (error) {
    console.error('Failed to save emails to file:', error);
  }
}

// Send notification email (backup #3)
async function sendNotificationEmail(email) {
  try {
    const mailOptions = {
      from: process.env.NOTIFICATION_EMAIL,
      to: process.env.NOTIFICATION_EMAIL, // Send to yourself
      subject: '🚨 NEW YARDLINE IQ SIGNUP!',
      html: `
        <h2>New Free Pick Signup!</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Signups:</strong> ${emailList.length}</p>
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automatic notification from your YardLine IQ website.
        </p>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Notification email sent for: ${email}`);
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

// Load emails on startup
loadEmailsFromFile();

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    const emailLower = email.toLowerCase();
    const existingEmail = emailList.find(e => e.email === emailLower);
    
    if (!existingEmail) {
      const emailEntry = {
        email: emailLower,
        signupDate: new Date().toISOString(),
        timestamp: Date.now()
      };
      
      // Add to memory (backup #1)
      emailList.push(emailEntry);
      
      // Save to file (backup #2)
      await saveEmailsToFile();
      
      // Send notification email (backup #3)
      await sendNotificationEmail(emailLower);
      
      console.log(`New email added with triple backup: ${email}`);
    }
    
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
router.get('/email-list', (req, res) => {
  const emailsForDisplay = emailList.map(entry => ({
    email: entry.email,
    signupDate: new Date(entry.signupDate)
  }));
  
  res.json({ 
    emails: emailsForDisplay,
    total: emailList.length 
  });
});

// Export emails (WITHOUT deleting them)
router.get('/export-emails', (req, res) => {
  const csvContent = 'Email,Signup Date\n' + 
    emailList.map(entry => `${entry.email},${entry.signupDate}`).join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="yardline-emails.csv"');
  res.send(csvContent);
  
  console.log(`Exported ${emailList.length} emails (kept in system)`);
});

module.exports = router;
