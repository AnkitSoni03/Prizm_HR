'use strict';

// Shadow-mode-first rollout switch (same convention as
// payroll_settings.enable_statutory_deductions): the anti-spoof model and
// screen-artifact heuristic always run and always log a
// face_verification_flags row on suspicion, but only actually BLOCK a
// check-in when this is true. Defaults false so a company can watch the
// Fraud Attempts review page for real employees before flipping it on and
// risking a false-reject lockout.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'face_antispoof_enforced', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('companies', 'face_antispoof_enforced');
  },
};
