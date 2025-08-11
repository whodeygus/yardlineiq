# YardLineIQ - Elite NFL Picks Platform

🏈 Complete business solution for selling NFL picks with payment processing, member dashboards, and admin management.

## 🚀 Quick Deploy Guide

### 1. Set Up Accounts (Free)
- **MongoDB Atlas**: Free database hosting
- **Stripe**: Payment processing 
- **Render**: Website hosting
- **GitHub**: Code hosting

### 2. Fill Out Environment Variables
In your `.env` file, replace with your actual keys:

```env
MONGODB_URI=your-mongodb-atlas-connection-string
STRIPE_PUBLISHABLE_KEY=pk_live_your-stripe-publishable-key
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
JWT_SECRET=make-this-a-random-string-123456789
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
```

### 3. Update Stripe Key in Homepage
In `public/index.html`, find line 430 and replace:
```javascript
const stripe = Stripe('pk_test_YOUR_PUBLISHABLE_KEY_HERE');
```
With your actual Stripe publishable key.

### 4. Deploy to Render
1. Upload all files to GitHub
2. Connect GitHub repo to Render
3. Add environment variables in Render dashboard
4. Deploy!

## 💰 Revenue Potential
- Weekly: $29 × 200 users × 17 weeks = $98,600
- Monthly: $89 × 300 users × 4 months = $106,800  
- Season: $199 × 300 users = $59,700
- **Total: $265,100+ per season**

## 🔧 Admin Access
- URL: `yourdomain.com/admin`
- Password: `YardLineIQ2024!`

## 📱 Features
✅ Modern, mobile-responsive design
✅ Real Stripe payment processing
✅ Member login & dashboard system
✅ Admin panel for posting picks
✅ Email marketing & free pick collection
✅ User management & analytics
✅ SEO optimized for NFL keywords

## 🆘 Support
Contact: info@yardlineiq.com

---
**Ready to make money with NFL picks!** 🔥