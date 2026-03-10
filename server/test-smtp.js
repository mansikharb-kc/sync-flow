require('dotenv').config({ path: './.env' });
const nodemailer = require('nodemailer');

console.log('Testing SMTP with:', process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.PRIMARY_ADMIN_EMAIL,
    subject: 'SMTP Test Connection',
    text: 'If you see this, the SMTP connection is working correctly!'
};

transporter.sendMail(mailOptions)
    .then(info => console.log('✅ TEST SUCCESS:', info.messageId))
    .catch(err => console.error('❌ TEST FAILED:', err.message));
