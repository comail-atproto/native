const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withIOSLocalNotifications(config) {
  return withEntitlementsPlist(config, (config) => {
    // Expo adds APNs by default, but Comail iOS only uses local notifications
    // and foreground polling. Its App Store profile has no push capability.
    delete config.modResults['aps-environment'];
    return config;
  });
};
