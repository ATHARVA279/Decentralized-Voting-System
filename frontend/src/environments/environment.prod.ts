export const environment = {
  production: true,
  // In K8s, NGINX proxies /api/* to services — same origin avoids CORS
  authServiceUrl:    '',
  electionServiceUrl:'',
  voteServiceUrl:    '',
  voteServiceWs:     `wss://${window.location.host}`,
};
