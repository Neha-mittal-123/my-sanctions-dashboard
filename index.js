const express = require('express');
const path = require('path');
const { getSanctions } = require('./src/sanctionsService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sanctions', async (req, res) => {
  try {
    const { records, fromCache, fetchedAt } = await getSanctions();

    res.json({
      total: records.length,
      fromCache,
      fetchedAt: new Date(fetchedAt).toISOString(),
      records,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
