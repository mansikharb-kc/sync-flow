const { db } = require('./db');
const bcrypt = require('bcryptjs');

// CHANGE THESE TO YOUR DESIRED ADMIN CREDENTIALS
const ADMIN_EMAIL = process.env.PRIMARY_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

(async () => {
  try {
    const email = ADMIN_EMAIL.toLowerCase().trim();

    const { rows: existing } = await db.query(
      'SELECT * FROM "users" WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      console.log(`User already exists with email ${email}. No changes made.`);
      process.exit(0);
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await db.query(
      'INSERT INTO "users" (email, password_hash, status) VALUES ($1, $2, $3)',
      [email, hash, 'ACTIVE']
    );

    console.log('✅ Admin user created successfully:');
    console.log(`   Email   : ${email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log('   (Password is case-sensitive)');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin user:', err.message);
    process.exit(1);
  }
})();

