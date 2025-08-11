const express = require('express');
const nodemailer = require('nodemailer');
const Pick = require('../models/Pick');
const router = express.Router();

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Email list storage (in production, use proper database)
let emailList = [];

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Add to email list if not already there
    if (!emailList.includes(email)) {
      emailList.push(email);
    }

    // Get latest free pick
    const latestFreePick = await Pick.findOne({ pickType: 'free' })
      .sort({ createdAt: -1 });

    if (!latestFreePick) {
      return res.status(404).json({ error: 'No free picks available' });
    }

    // Send email with pick
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🏈 Your Free NFL Pick - YardLineIQ',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00ff88, #00ccff); padding: 20px; text-align: center;">
            <h1 style="color: black; margin: 0;">YARDLINEIQ</h1>
            <p style="color: black; margin: 5px 0;">Elite NFL Picks</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333;">Your Free Pick This Week</h2>
            
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #00ff88; margin-top: 0;">${latestFreePick.game}</h3>
              <p style="font-size: 18px; font-weight: bold; color: #333;">${latestFreePick.pick}</p>
              <p style="color: #666;">Confidence: ${latestFreePick.confidence}</p>
              <p style="color: #666;">Game Time: ${new Date(latestFreePick.gameTime).toLocaleDateString()} at ${new Date(latestFreePick.gameTime).toLocaleTimeString()}</p>
              ${latestFreePick.analysis ? `<p style="color: #333; margin-top: 15px;">${latestFreePick.analysis}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://yardlineiq.com/#pricing" style="background: linear-gradient(135deg, #00ff88, #00ccff); color: black; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">Get Premium Picks</a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Want more winning picks? Our premium members get 3-5 expert picks per week with our proven 61% win rate model.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Free pick sent successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Send newsletter/flash sale
router.post('/newsletter', async (req, res) => {
  try {
    const { subject, content } = req.body;

    const promises = emailList.map(email => {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        html: content
      };
      return transporter.sendMail(mailOptions);
    });

    await Promise.all(promises);

    res.json({ message: `Newsletter sent to ${emailList.length} subscribers!` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send newsletter' });
  }
});

module.exports = router;

