# 📦 Required Package Installation

## Socket.io Client

The mobile app now uses WebSocket for real-time chat. You need to install the `socket.io-client` package:

```bash
cd mobile
npm install socket.io-client
```

## Verification

After installation, verify the package is in your `package.json`:

```json
{
  "dependencies": {
    "socket.io-client": "^4.x.x",
    ...
  }
}
```

## Then Restart Metro

After installing, restart your Metro bundler with cache cleared:

```bash
npm start --reset-cache
```

---

That's it! The app should now work with all the new features.

