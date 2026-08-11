const DEFAULT_BASE_URL = "https://nginx-gateway-http-trainee-playground-7.test.medone-1.med.one/";

window.onload = () => {
  const savedUrl = localStorage.getItem('tritonUrl');
  const routeInput = document.getElementById('routeUrl');
  
  if (routeInput) {
    routeInput.value = savedUrl || DEFAULT_BASE_URL;
  }
  
  if (!savedUrl) {
    localStorage.setItem('tritonUrl', DEFAULT_BASE_URL);
  }
};

function launchApp(targetPage) {
  const routeInput = document.getElementById('routeUrl').value.trim().replace(/\/$/, "");
  localStorage.setItem('tritonUrl', routeInput);
  window.location.href = targetPage;
}