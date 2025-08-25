const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const router = express.Router();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, packageType, customerInfo } = req.body;
    
    if (!customerInfo || !customerInfo.name || !customerInfo.email) {
      return res.status(400).json({ error: 'Customer name and email are required' });
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: currency || 'usd',
      metadata: {
        packageType,
        userEmail: customerInfo.email,
        userName: customerInfo.name,
        purchaseDate: new Date().toISOString()
      }
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle successful payment
router.post('/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      return res.status(400).json({ error: 'Customer information is required' });
    }
    
    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      const client = await pool.connect();
      
      try {
        // Create users table if it doesn't exist
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            subscription VARCHAR(50) NOT NULL,
            subscription_end TIMESTAMP,
            payment_intent_id VARCHAR(255),
            purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Check if user exists
        const userCheck = await client.query('SELECT * FROM users WHERE email = $1', [customerInfo.email]);
        
        let subscriptionEnd;
        if (packageType === 'weekly') {
          subscriptionEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (packageType === 'monthly') {
          subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (packageType === 'season') {
          subscriptionEnd = new Date('2025-02-15');
        }

        let user;
        if (userCheck.rows.length === 0) {
          // Create new user
          const nameParts = customerInfo.name.split(' ');
          const firstName = nameParts[0] || customerInfo.name;
          const lastName = nameParts.slice(1).join(' ') || 'Member';
          
          const result = await client.query(`
            INSERT INTO users (email, first_name, last_name, subscription, subscription_end, payment_intent_id, purchase_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `, [customerInfo.email, firstName, lastName, packageType, subscriptionEnd, paymentIntentId, new Date()]);
          
          user = result.rows[0];
        } else {
          // Update existing user
          const result = await client.query(`
            UPDATE users 
            SET subscription = $1, subscription_end = $2, payment_intent_id = $3, purchase_date = $4
            WHERE email = $5
            RETURNING *
          `, [packageType, subscriptionEnd, paymentIntentId, new Date(), customerInfo.email]);
          
          user = result.rows[0];
        }

        // Send notification emails
        if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
          await sendNotificationEmails(user, packageType, paymentIntentId);
        }

        res.json({
          success: true,
          message: 'Payment processed successfully!',
          userId: user.id,
          subscriptionEnd: user.subscription_end
        });

      } finally {
        client.release();
      }
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all customers for admin dashboard
router.get('/customers', async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT id, first_name, last_name, email, subscription, subscription_end, purchase_date, payment_intent_id
        FROM users 
        WHERE subscription IS NOT NULL 
        ORDER BY purchase_date DESC
      `);
      
      const formattedCustomers = result.rows.map(customer => ({
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        packageType: customer.subscription,
        purchaseDate: customer.purchase_date,
        subscriptionEnd: customer.subscription_end,
        paymentId: customer.payment_intent_id
      }));
      
      res.json({ customers: formattedCustomers });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const totalUsersResult = await client.query('SELECT COUNT(*) FROM users');
      const paidSubscribersResult = await client.query('SELECT COUNT(*) FROM users WHERE subscription IS NOT NULL');
      
      res.json({
        totalUsers: parseInt(totalUsersResult.rows[0].count),
        paidSubscribers: parseInt(paidSubscribersResult.rows[0].count),
        totalPicks: 0,
        emailSignups: 0,
        winRate: 61
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Function to send notification emails
async function sendNotificationEmails(user, packageType, paymentIntentId) {
  try {
    const emailContent = `
New Customer Purchase!

Customer: ${user.first_name} ${user.last_name}
Email: ${user.email}
Package: ${packageType}
Purchase Date: ${user.purchase_date}
Subscription End: ${user.subscription_end}
Payment ID: ${paymentIntentId}

Customer has been added to the database and is ready for access.
    `;

    const adminEmails = ['admin@yardlineiq.com', 'gustin.puckett@gmail.com'];
    
    for (const email of adminEmails) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `New YardLineIQ Purchase - ${packageType}`,
        text: emailContent
      });
    }

    console.log('Notification emails sent successfully');
  } catch (error) {
    console.error('Email sending error:', error);
  }
}

module.exports = router;
