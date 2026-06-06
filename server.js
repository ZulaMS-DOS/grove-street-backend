const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: '✅ Grove Street Backend Online',
    time: new Date().toISOString()
  });
});

// ─── DISCORD OAUTH2 CALLBACK ─────────────────────────────
// Frontend trimite: { code, redirect_uri }
// Backend returnează: { access_token, user: { id, username, global_name, avatar } }
app.post('/auth/callback', async (req, res) => {
  const { code, redirect_uri } = req.body;

  if (!code || !redirect_uri) {
    return res.status(400).json({ error: 'Lipsă code sau redirect_uri' });
  }

  try {
    // ── Pasul 1: Schimbă code → access_token ──────────────
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Token error:', tokenData);
      return res.status(401).json({
        error: 'Token invalid',
        details: tokenData.error_description || tokenData.error
      });
    }

    const accessToken = tokenData.access_token;

    // ── Pasul 2: Ia datele userului de pe Discord ──────────
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = await userRes.json();

    if (!userData.id) {
      return res.status(401).json({ error: 'Nu s-au putut lua datele userului' });
    }

    // ── Pasul 3: Verifică dacă e pe server ────────────────
    if (process.env.DISCORD_SERVER_ID) {
      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const guilds = await guildsRes.json();

      const onServer = Array.isArray(guilds) && guilds.some(g => g.id === process.env.DISCORD_SERVER_ID);

      if (!onServer) {
        return res.status(403).json({
          error: 'not_on_server',
          message: 'Nu ești pe serverul organizației Grove Street.'
        });
      }

      // ── Verificare rol eliminată — ajunge să fie pe server ──
    }

    // ── Succes: Returnează datele ──────────────────────────
    res.json({
      access_token: accessToken,
      user: {
        id: userData.id,
        username: userData.username,
        global_name: userData.global_name || userData.username,
        avatar: userData.avatar
          ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
          : null,
        discriminator: userData.discriminator
      }
    });

  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({
      error: 'Eroare server',
      message: err.message
    });
  }
});

// ─── START ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Grove Street Backend pornit pe portul ${PORT}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || '(orice origine)'}`);
  console.log(`   Server ID:    ${process.env.DISCORD_SERVER_ID || '(nesetat)'}`);
  console.log(`   Mod verificare: doar server (fara rol)`);
});
