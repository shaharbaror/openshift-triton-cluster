document.addEventListener("DOMContentLoaded", () => {
  const btnCompare = document.getElementById("btn-compare");
  const endpointInput = document.getElementById("endpoint-url");
  const textAInput = document.getElementById("text-a");
  const textBInput = document.getElementById("text-b");
  
  const resultBox = document.getElementById("similarity-result");
  const scoreVal = document.getElementById("score-val");
  const latencyVal = document.getElementById("latency-val");
  const jsonOutput = document.getElementById("json-output");
  const statusBar = document.getElementById("status-indicator");

  btnCompare.addEventListener("click", async () => {
    const endpoint = endpointInput.value.trim();
    const textA = textAInput.value.trim();
    const textB = textBInput.value.trim();

    if (!endpoint || !textA || !textB) {
      showError("Please fill out all fields.");
      return;
    }

    btnCompare.disabled = true;
    btnCompare.textContent = "Processing Inference...";
    clearError();

    const startTime = performance.now();

    try {
      // Send sequential requests for Text A and Text B to Triton HTTP v2 API
      const [embA, embB, rawResponse] = await Promise.all([
        getEmbedding(endpoint, textA),
        getEmbedding(endpoint, textB),
        fetchRawResponse(endpoint, textA)
      ]);

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      // Calculate Cosine Similarity between vectors
      const similarity = cosineSimilarity(embA, embB);
      
      // Update UI
      scoreVal.textContent = `${(similarity * 100).toFixed(2)}%`;
      latencyVal.textContent = `Latency: ${latency} ms`;
      resultBox.classList.remove("hidden");

      // Display sample raw response vector output
      jsonOutput.textContent = JSON.stringify(rawResponse, null, 2);

    } catch (err) {
      showError(`Inference failed: ${err.message}`);
    } finally {
      btnCompare.disabled = false;
      btnCompare.textContent = "Compare Sentences & Calculate Similarity";
    }
  });

  // Constructs Triton v2 HTTP payload for string input
  async function fetchRawResponse(endpoint, text) {
    const payload = {
      inputs: [
        {
          name: "TEXT",
          shape: [1, 1],
          datatype: "BYTES",
          data: [text]
        }
      ]
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Triton returned HTTP ${response.status}: ${errText}`);
    }

    return await response.json();
  }

  async function getEmbedding(endpoint, text) {
    const res = await fetchRawResponse(endpoint, text);
    // Extract vector data from Triton output tensor format
    return res.outputs[0].data;
  }

  // Cosine similarity for normalized vectors (dot product)
  function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct;
  }

  function showError(msg) {
    statusBar.textContent = msg;
    statusBar.classList.remove("hidden");
    statusBar.classList.add("error");
  }

  function clearError() {
    statusBar.classList.add("hidden");
    statusBar.classList.remove("error");
  }
});