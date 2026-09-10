import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Customize these through environment variables: 
// k6 run -e API_KEY=YOUR_KEY test/load/issue-verify.k6.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3068';
const API_KEY = __ENV.API_KEY || 'cap_live_cfcf41a0e5d94abfa864a7c06eb7cc79';
const DOMAIN = __ENV.DOMAIN || 'localhost';

const issueLatency = new Trend('issue_duration');
const verifyLatency = new Trend('verify_duration');
const issueSuccessRate = new Rate('issue_success');
const verifySuccessRate = new Rate('verify_success');

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // Ramp up to 10 users
    { duration: '20s', target: 50 },   // Ramp up to 50 users
    { duration: '20s', target: 100 },  // Ramp up to 100 users
    { duration: '10s', target: 0 },    // Scale down
  ],
  thresholds: {
    'issue_duration': ['p(95)<200'], // 95% of requests should be below 200ms
    'verify_duration': ['p(95)<200'],
    'issue_success': ['rate>0.99'],  // 99% success rate
    'verify_success': ['rate>0.99'],
  },
};

export default function () {
  const issuePayload = JSON.stringify({
    domain: DOMAIN,
    honeypot_filled: false,
    client_signals: {
      webdriver: false,
      canvas_fingerprint: 'random-hash-1234',
      time_on_page_ms: Math.floor(Math.random() * (5000 - 1000 + 1) + 1000), // 1s to 5s
      mouse_moves: 45,
      mouse_clicks: 3,
      key_strokes: 12
    }
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
  };

  // 1. Goi /issue
  const issueRes = http.post(`${BASE_URL}/v1/issue`, issuePayload, params);
  
  issueLatency.add(issueRes.timings.duration);
  issueSuccessRate.add(issueRes.status === 200 || issueRes.status === 201);
  
  check(issueRes, {
    'issue status is 200/201': (r) => r.status === 200 || r.status === 201,
    'has session_id': (r) => {
      try {
        const data = r.json();
        return data && data.session_id !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  if (issueRes.status !== 200 && issueRes.status !== 201) {
    sleep(1);
    return; // Dung luong neu issue loi
  }

  const issueData = issueRes.json();
  const sessionId = issueData.session_id;
  const challengeType = issueData.challenge_type;

  sleep(Math.random() * 2 + 1); // Nghi 1-3s (Mo phong user giai challenge/submit form)

  // 2. Goi /verify
  let verifyPayloadObj = {
    session_id: sessionId,
  };

  if (challengeType === 'slider') {
    verifyPayloadObj['challenge_response'] = {
      type: 'slider',
      final_position: 150
    };
  } else if (challengeType === 'pow') {
    verifyPayloadObj['challenge_response'] = {
      type: 'pow',
      nonce: '123456789'
    };
  }

  const verifyRes = http.post(`${BASE_URL}/v1/verify`, JSON.stringify(verifyPayloadObj), params);
  
  verifyLatency.add(verifyRes.timings.duration);
  verifySuccessRate.add(verifyRes.status === 200 || verifyRes.status === 201);
  
  check(verifyRes, {
    'verify status is 200/201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(1);
}
