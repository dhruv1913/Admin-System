const express = require('express');
const ldap = require('ldapjs');

const app = express();
app.use(express.json());

// LDAP server config
const LDAP_URL = 'ldap://localhost:389';
const BASE_DN = 'dc=mycompany,dc=com';
const ADMIN_DN = 'cn=admin,dc=mycompany,dc=com';
const ADMIN_PASSWORD = 'adminpassword';

function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url: LDAP_URL });
    console.log(`Connecting to LDAP server at ${LDAP_URL}`);

    client.bind(ADMIN_DN, ADMIN_PASSWORD, (err) => {
      if (err) {
        console.error('Admin bind failed:', err);
        client.unbind();
        return reject('LDAP admin bind failed: ' + err);
      }
      console.log('Admin bind successful.');

      // EXPLICITLY REQUEST all expected attributes
      const searchOptions = {
        scope: 'sub',
        filter: `(uid=${username})`,
        attributes: [
          'uid', 'cn', 'sn', 'mobile', 'title', 'description', 'userPassword'
        ]
      };

      let userDN = null;
      let userDetails = null;

      client.search(BASE_DN, searchOptions, (err, res) => {
        if (err) {
          console.error('LDAP search error:', err);
          client.unbind();
          return reject('LDAP search error: ' + err);
        }

        res.on('searchEntry', entry => {
          userDN = typeof entry.dn === 'string'
            ? entry.dn
            : (entry.objectName && entry.objectName.toString ? entry.objectName.toString() : null);

          // Build user details from attributes if entry.object is empty
          if (entry.object && Object.keys(entry.object).length > 0) {
            userDetails = entry.object;
          } else {
            userDetails = {};
            entry.attributes.forEach(attr => {
              userDetails[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            });
          }

          console.log('User DN found:', userDN);
          console.log('User details object:', userDetails);
        });

        res.on('error', err => {
          console.error('Search error event:', err);
          client.unbind();
          return reject('LDAP search error: ' + err);
        });

        res.on('end', () => {
          if (!userDN) {
            console.log('No user DN found for username:', username);
            client.unbind();
            return reject('User not found');
          }

          console.log(`Attempting user bind as: ${userDN}`);

          client.bind(String(userDN), String(password), err => {
            client.unbind();
            if (err) {
              console.error('User bind failed:', err);
              return reject('Invalid credentials');
            }
            console.log('User bind successful. Authentication passed.');
            resolve(userDetails);
          });
        });
      });
    });
  });
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('Missing username or password in request body.');
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    console.log(`Login attempt for username: ${username}`);
    const userDetails = await ldapAuthenticate(username, password);
    res.json({ user: userDetails });
  } catch (err) {
    console.log('Authentication error:', err);
    res.status(401).json({ error: err });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`LDAP Auth API listening on port ${PORT}`);
});
