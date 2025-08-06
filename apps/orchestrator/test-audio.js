import http from 'http';

const data = JSON.stringify({
  text: "Yo yo yo, what is up stream! Rusty Butter here! We are live and the audio system is working perfectly! Let's gooooo!",
  voice_id: "Au8OOcCmvsCaQpmULvvQ",
  model_id: "eleven_flash_v2",
  buffer_size: 1024
});

const options = {
  hostname: 'localhost',
  port: 3454,
  path: '/tools/stream_audio',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let response = '';
  
  res.on('data', (chunk) => {
    response += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', response);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();