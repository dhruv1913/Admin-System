// passportConfig.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const LdapStrategy = require("passport-ldapauth");

require("dotenv").config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK,
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  FACEBOOK_CALLBACK,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_CALLBACK,
  LDAP_URL,
  LDAP_BIND_DN,
  LDAP_BIND_CREDENTIALS,
  LDAP_SEARCH_BASE,
  LDAP_SEARCH_FILTER
} = process.env;

// NOTE: for production use persistent user store; here we just pass profile through.

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Google
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: GOOGLE_CALLBACK
}, (accessToken, refreshToken, profile, done) => {
    console.log("Access Token:", accessToken);      // short-lived token from Google
  console.log("Refresh Token:", refreshToken);    // optional, if enabled
  console.log("Profile:", profile);               // user info
  // Map profile to your user model or create if new
  return done(null, { provider: "google", profile });
}));

// Facebook
passport.use(
  new FacebookStrategy(
    {
      clientID: FACEBOOK_CLIENT_ID,
      clientSecret: FACEBOOK_CLIENT_SECRET,
      callbackURL: FACEBOOK_CALLBACK,
      profileFields: ["id", "emails", "name", "picture.type(large)"], // ensures we get email + name
    },
    (accessToken, refreshToken, profile, done) => {
      console.log("✅ Facebook login successful");
      console.log("Profile:", profile);

      // Map or create user record here
      return done(null, { provider: "facebook", profile });
    }
  )
);
// Twitter
passport.use(new TwitterStrategy({
  consumerKey: TWITTER_CONSUMER_KEY,
  consumerSecret: TWITTER_CONSUMER_SECRET,
  callbackURL: TWITTER_CALLBACK
}, (token, tokenSecret, profile, done) => {
  return done(null, { provider: "twitter", profile });
}));

// LDAP / Active Directory
passport.use(new LdapStrategy({
  server: {
    url: LDAP_URL,
    bindDN: LDAP_BIND_DN,
    bindCredentials: LDAP_BIND_CREDENTIALS,
    searchBase: LDAP_SEARCH_BASE,
    searchFilter: LDAP_SEARCH_FILTER
  }
}, (user, done) => {
  // `user` contains LDAP attributes
  return done(null, { provider: "ldap", profile: user });
}));

module.exports = passport;
