const express = require("express");
const app = express();
const port = 4075;

app.get("/", (req, res) => {
  res.send("Setup backend for final project sinau koding");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  iniResponseDasar = "Sudah aktif ya bos backend expressnya";
  console.log(iniResponseDasar);
});
