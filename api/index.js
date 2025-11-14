const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(express.json());
const cors = require('cors');
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:3050'], // Allow requests from the frontend
    methods: ['GET', 'POST', 'OPTIONS'], // Allow these methods
    credentials: true // Allow cookies and credentials
}));

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

const BLYNK_TOKEN = process.env.BLYNK_TOKEN || '';

async function blynkGet(pin) {
  const url = `https://blynk.cloud/external/api/get?token=${BLYNK_TOKEN}&${pin}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blynk GET failed: ${res.status}`);
  const text = await res.text();
  const num = parseInt(text, 10);
  return Number.isNaN(num) ? 0 : num;
}

async function blynkUpdate(pin, value) {
  const val = pin === 'V1' ? Math.abs(value - 1) : value;
  const url = `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&${pin}=${val}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Blynk UPDATE failed: ${res.status}`);
  return true;
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && supabaseKey) {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password} = req.body || {};
    if (!username || !password ) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    role="homie"

    console.log('Login request received:', { username, password });
    const { data, error } = await supabase
      .from('Users')
      .select('Username,Password,Role')
      .eq('Username', username)
      .eq('Role', role)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'invalid credentials' , error: error.message});
    }
    if (String(data.Password) !== String(password)) {
      return res.status(401).json({ error: 'Password does not match' });
    }

    return res.json({ ok: true, user: { username: data.Username, role: data.Role } });
  } catch (e) {
    console.error('Unexpected error:', e);
res.status(500).json({ error: 'An unexpected error occurred' });
  }
});


app.options('/api/auth/login_Interprise', cors());
app.post('/api/auth/login_Interprise', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password ) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data, error } = await supabase
      .from('Users')
      .select('Username,Password,Role')
      .eq('Username', username)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'invalid credentials' , error: error.message});
    }
    console.log(data.Role);
    if (String(data.Password) !== String(password)) {
      return res.status(401).json({ error: 'Password does not match' });
    }

    return res.json({ ok: true, user: { username: data.Username, role: data.Role } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/devices/states', async (req, res) => {
  //get states of all devices from the db table named Devices and return them in a json object
  data={}
  try {
    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    const { data, error } = await supabase
      .from('Devices')
      .select('DeviceId,Current_Status');
    if (error || !data) {
      return res.status(401).json({ error: 'invalid credentials' , error: error.message});
    }
    const transformedObject = data.reduce((accumulator, currentItem) => {
      const key = "V" + currentItem.DeviceId;
      const s = currentItem.Current_Status;
      let v;
      if (typeof s === 'string') {
        const up = s.toUpperCase();
        v = up === 'ON' ? 1 : 0;
      } else if (typeof s === 'number') {
        v = s === 1 ? 1 : 0;
      } else {
        v = 0;
      }
      accumulator[key] = v;
      return accumulator;
    }, {});
    res.json(transformedObject);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/devices/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const { value, timeString, date } = req.body || {};
    if (!pin || !/^V\d+$/.test(pin)) {
      return res.status(400).json({ error: 'invalid pin' });
    }
    if (value !== 0 && value !== 1) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }

    await blynkUpdate(pin, value);

    const response = { pin, value, status: value === 1 ? 'ON' : 'OFF', updated: true };

    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      if (supabaseUrl && supabaseKey) {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const now = new Date();
        const logTime = timeString || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const logDate = date || `${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()}`;

        const insertData = {
          device_id: pin,
          state: response.status,
          time: logTime,
          date: logDate
        };
        const { error } = await supabase.from('DeviceLogs').insert([insertData]);
        response.logged = !error;

        const currentStatus = response.status;
        const devid = parseInt(pin.slice(1), 10);
        const updateData = {
          DeviceId: devid,
          Current_Status: currentStatus
        };
        const { error: error2 } = await supabase
          .from('Devices')
          .update(updateData)
          .eq('DeviceId', devid);
        if (error2) response.logged = false;
      }
    } catch (logErr) {
      response.logged = false;
      response.logError = String(logErr.message || logErr);
    }

    res.json(response);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/student_request',async(req, res)=>{
    const {DeviceId, state, clas} = req.body || {};
    if (!DeviceId || !state || !clas) {
      return res.status(400).json({ error: 'DeviceId, state, and class required' });
    }
    try{
      const supabase = createSupabase();
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }
      if(supabase) {
      }
      const insertData = {
        DeviceId: DeviceId,
        State: state,
        Class: clas
      };
      const { data, error } = await supabase.from('Request').insert([insertData]).select();
      if (error) {
        return res.status(500).json({ error: 'Failed to insert request', details: error.message});
      }
      res.json({ ok: true, user: { DeviceId: DeviceId, state: state, class: clas } });
    }
    catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
});

app.post('/api/device/get_pending_student_request',async(req,res)=>{
  try{
    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    //select everything from the Request table
    const { data, error } = await supabase
      .from('Request')
      .select('*')
      .eq('completed', false);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch requests', details: error.message});
    }
    res.json({ ok: true, user: data || [] });
  }
  catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/device/get_approved_student_request',async(req,res)=>{
  try{
    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    //select everything from the Request table
    const { data, error } = await supabase
      .from('Request')
      .select('*')
      .eq('completed', true)
      .eq('Approval', 'YES');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch requests', details: error.message});
    }
    res.json({ ok: true, user: data || [] });
  }
  catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/device/get_denied_student_request',async(req,res)=>{
  try{
    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    //select everything from the Request table
    const { data, error } = await supabase
      .from('Request')
      .select('*')
      .eq('completed', true)
      .eq('Approval', 'NO');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch requests', details: error.message});
    }
    res.json({ ok: true, user: data || [] });
  }
  catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});


app.post('/api/device/set_student_request',async(req,res)=>{
  const {DeviceId, State, Class, Approval} = req.body || {};
  if (!DeviceId || !State || !Class || !Approval) {
    return res.status(400).json({ error: 'DeviceId, State, Class, and Approval required' });
  }
  try{
    const supabase = createSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    //select everything from the Request table
    if(Approval === 'YES'){
      //turn in the device using blynk api
      if(State === 'ON'){
        await blynkUpdate(DeviceId, 1);
      }
      else{
        await blynkUpdate(DeviceId, 0);
      }
    }

    //delete the column from the table
    const { data, error } = await supabase
      .from('Request')
      .update({Approval: Approval, completed: true})
      .eq('DeviceId', DeviceId)
      .eq('State', State)
      .eq('Class', Class)
      .select();

    if (error) {
      return res.status(500).json({ error: 'Failed to process request', details: error.message});
    }
    res.json({ ok: true, message: `Request ${Approval === 'YES' ? 'approved' : 'denied'} successfully`, Data: data });
  }
  catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});



app.get('/api/environment', async (req, res) => {
  try {
    const t = await blynkGet('V5');
    const h = await blynkGet('V6');
    const a = await blynkGet('V9');
    res.json({ temp: t, humidity: h, aqi: a });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
function tryListen(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
}
tryListen(DEFAULT_PORT);