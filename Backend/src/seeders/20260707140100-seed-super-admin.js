'use strict';

const bcrypt = require('bcrypt');

// Bootstraps the very first Super Admin, since someone has to exist to
// create the first Group/Company/Brand (CLAUDE.md: "Only Super Admin
// creates Groups, Companies, Brands"). Override via env vars in real
// environments — these defaults are for local/dev only.
const EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@hrms.local';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!';
const BCRYPT_ROUNDS = 12;

module.exports = {
  async up(queryInterface, Sequelize) {
    const [role] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'Super Admin' AND is_system = true LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) {
      throw new Error('Seed order error: "Super Admin" role not found. Run seed-roles first.');
    }

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email AND company_id IS NULL',
      { replacements: { email: EMAIL }, type: Sequelize.QueryTypes.SELECT }
    );
    if (existing) return;

    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        company_id: null,
        email: EMAIL,
        password_hash: passwordHash,
        status: 'active',
        is_active: true,
        activated_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);

    const [user] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email AND company_id IS NULL',
      { replacements: { email: EMAIL }, type: Sequelize.QueryTypes.SELECT }
    );

    await queryInterface.bulkInsert('user_roles', [
      {
        user_id: user.id,
        role_id: role.id,
        company_id: null,
        brand_id: null,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    const [user] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email AND company_id IS NULL',
      { replacements: { email: EMAIL }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!user) return;

    await queryInterface.bulkDelete('user_roles', { user_id: user.id });
    await queryInterface.bulkDelete('users', { id: user.id });
  },
};
