const { withAppDelegate } = require('expo/config-plugins');

// SDK 54 still creates its window in AppDelegate. iOS 27 requires a scene
// delegate, including URL and lifecycle forwarding for the existing Expo APIs.
module.exports = function withIOSScenes(config) {
  return withAppDelegate(config, (config) => {
    const delegate = config.modResults;
    if (delegate.language !== 'swift') {
      throw new Error('Comail scene startup requires a Swift AppDelegate.');
    }
    if (delegate.contents.includes('@objc(ComailSceneDelegate)')) return config;

    const startup =
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\n#endif/;
    if (
      !startup.test(delegate.contents) ||
      !delegate.contents.includes('var window: UIWindow?')
    ) {
      throw new Error(
        'Comail scene startup expects the Expo SDK 54 AppDelegate template.',
      );
    }
    delegate.contents =
      delegate.contents
        .replace(
          'var window: UIWindow?',
          'var window: UIWindow?\n  var comailLaunchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]',
        )
        .replace(startup, '    comailLaunchOptions = launchOptions ?? [:]') +
      sceneDelegate;
    return config;
  });
};

const sceneDelegate = `

@objc(ComailSceneDelegate)
class ComailSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = appDelegate,
      let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // React Native's getInitialURL reads launch options, while UIKit now
    // delivers cold-start links through the scene connection options.
    var launchOptions = appDelegate.comailLaunchOptions
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
    }
    if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }) {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }
    appDelegate.comailLaunchOptions = [:]
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)

    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else { return }
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = appDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    if appDelegate?.window === window { appDelegate?.window = nil }
    window = nil
  }
}
`;
