// Load saved route URL on page open
window.onload = () => {
  const savedUrl = localStorage.getItem('tritonUrl');
  if (savedUrl) {
    document.getElementById('routeUrl').value = savedUrl;
    fetchAvailableModels();
  }
};

async function fetchAvailableModels() {
  const routeInput = document.getElementById('routeUrl').value.trim().replace(/\/$/, "");
  const catalogStatus = document.getElementById('catalogStatus');
  const modelGrid = document.getElementById('modelGrid');

  if (!routeInput) {
    alert("Please enter your OpenShift Route URL.");
    return;
  }

  // Save URL for cross-page persistence
  localStorage.setItem('tritonUrl', routeInput);

  catalogStatus.className = "status-idle";
  catalogStatus.innerText = "Querying Triton model repository...";
  modelGrid.innerHTML = "";
  modelGrid.classList.add('hidden');

  try {
    const endpoint = `${routeInput}/v2/repository/index`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const models = await response.json();
    const readyModels = models.filter(m => m.state === "READY");

    if (readyModels.length === 0) {
      catalogStatus.innerText = "No models in READY state were found.";
      return;
    }

    catalogStatus.innerText = "";
    renderModelGrid(readyModels);

  } catch (err) {
    catalogStatus.innerText = `Failed to connect: ${err.message}. Ensure the OpenShift Route is active and SSL certificate is trusted.`;
    console.error(err);
  }
}

function renderModelGrid(models) {
  const modelGrid = document.getElementById('modelGrid');
  modelGrid.innerHTML = "";

  models.forEach(model => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="model-info">
        <h3>${model.name}</h3>
        <p>Version: ${model.version || '1'}</p>
      </div>
      <div>
        <span class="status-badge badge-ready">${model.state}</span>
      </div>
      <button class="btn-primary" onclick="launchClassifier('${model.name}')">Open Classifier &rarr;</button>
    `;
    modelGrid.appendChild(card);
  });

  modelGrid.classList.remove('hidden');
}

// Redirect to classifier page with model parameter
function launchClassifier(modelName) {
  window.location.href = `classifier.html?model=${encodeURIComponent(modelName)}`;
}
