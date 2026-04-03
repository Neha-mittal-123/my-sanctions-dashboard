const axios = require('axios');

const BASE_URL = 'https://api.opensanctions.org/search/default';

async function fetchBySchema(schema) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fetching schema: ${schema}`);
  console.log('='.repeat(60));

  const apiKey = process.env.OPENSANCTIONS_API_KEY;
  if (!apiKey) throw new Error('Set OPENSANCTIONS_API_KEY environment variable');

  const response = await axios.get(BASE_URL, {
    params: { schema, limit: 1, q: '' },
    headers: { Accept: 'application/json', Authorization: `ApiKey ${apiKey}` },
  });

  console.log(JSON.stringify(response.data, null, 2));
}

(async () => {
  try {
    await fetchBySchema('Vessel');
    await fetchBySchema('Airplane');
  } catch (err) {
    console.error('Error:', err.response?.status, err.response?.data || err.message);
  }
})();
