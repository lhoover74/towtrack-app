const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req,res)=>{
  res.send('TowTrack API running');
});

app.listen(PORT, ()=>{
  console.log('TowTrack running on port '+PORT);
});