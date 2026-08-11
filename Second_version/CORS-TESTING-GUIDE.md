# CORS Fix - Testing Guide

## What Changed

The `session-route.yaml` has been updated with **proper HAProxy annotation syntax** for CORS headers:

### Before (Broken - Multiline Format):
```yaml
haproxy.router.openshift.io/set-header-response: "Access-Control-Allow-Origin *\nAccess-Control-Allow-Methods POST, GET, OPTIONS\n..."
```

### After (Fixed - Pipe-Separated Format):
```yaml
haproxy.router.openshift.io/set-header-response: "Access-Control-Allow-Origin: * | Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE | Access-Control-Allow-Headers: Content-Type, Accept, Authorization | Access-Control-Max-Age: 3600"
```

**Key Differences:**
1. ✅ Single-line format (no newlines `\n`)
2. ✅ Pipe separators `|` between headers (HAProxy compatible)
3. ✅ Proper header syntax with colons (e.g., `Origin:`, not `Origin`)
4. ✅ Added `Access-Control-Max-Age: 3600` to cache preflight requests
5. ✅ Support for PUT/DELETE methods for future API expansion

---

## Deployment Steps

### Step 1: Apply the Updated Route Configuration
```bash
# From your project directory
kubectl apply -f Second_version/session-route.yaml
# OR on OpenShift
oc apply -f Second_version/session-route.yaml
```

### Step 2: Verify the Route Was Updated
```bash
# Check the route annotation
oc describe route triton-route -n <your-namespace>
# Or list routes
oc get routes -n <your-namespace>
```

---

## Testing the Fix

### Method 1: Browser DevTools (Recommended for Your HTML Client)

1. **Open the HTML file in your browser**
   - Double-click `triton-infer.html` or serve it via local server
   - (To serve locally: `python -m http.server 8000` in the DEMO folder)

2. **Open Developer Tools** → F12
   - Go to **Network** tab
   - Go to **Console** tab

3. **Test Health Endpoint** (Simpler, no preflight)
   - Enter your OpenShift Route URL: `https://triton-route-<namespace>.apps.<cluster-domain>`
   - Click "Check Health Status"
   - Look in **Network** tab for the request to `/v2/health/ready`
   - Check **Response Headers** section - you should see:
     ```
     Access-Control-Allow-Origin: *
     Access-Control-Allow-Methods: GET, POST, OPTIONS, ...
     ```

4. **Test Inference Request** (Full test with preflight)
   - Click "Reset Sample Payload" to populate the JSON
   - Click "Send Inference Request"
   - In **Network** tab, you'll see TWO requests:
     - **OPTIONS** (preflight) → Check for CORS headers in response
     - **POST** (actual request) → Should succeed if OPTIONS passed
   - No CORS errors in **Console** tab = ✅ Success!

### Method 2: curl (Direct HTTP Testing - Bypasses CORS)

```bash
# Test health endpoint (no preflight needed)
curl -k https://triton-route-<namespace>.apps.<cluster-domain>/v2/health/ready \
  -H "Content-Type: application/json"

# Test with verbose output to see response headers
curl -k -v https://triton-route-<namespace>.apps.<cluster-domain>/v2/health/ready

# Test OPTIONS preflight (simulates browser)
curl -k -X OPTIONS https://triton-route-<namespace>.apps.<cluster-domain>/v2/models/image_classifier/infer \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

### Method 3: PowerShell (Windows - Testing from Your Machine)

```powershell
# Simple GET test
Invoke-WebRequest -Uri "https://triton-route-<namespace>.apps.<cluster-domain>/v2/health/ready" `
  -SkipCertificateCheck `
  -Headers @{"Content-Type"="application/json"} `
  -Method GET

# See response headers
$response = Invoke-WebRequest -Uri "https://triton-route-<namespace>.apps.<cluster-domain>/v2/health/ready" `
  -SkipCertificateCheck
$response.Headers
```

---

## What to Look For in Response Headers

### ✅ Success Indicators:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Accept, Authorization
Access-Control-Max-Age: 3600
```

### ❌ If Still Getting CORS Errors:

**Error in Browser Console:**
```
Access to XMLHttpRequest at 'https://...' from origin 'http://localhost:3000' 
has been blocked by CORS policy: ...
```

**Troubleshooting Steps:**

1. **Route not updated yet**
   - OpenShift may take 10-30 seconds to apply route changes
   - Verify with: `oc get routes -o yaml | grep "Access-Control"`
   - Try clearing browser cache (Ctrl+Shift+Del)

2. **Check if route is active**
   ```bash
   oc describe route triton-route -n <namespace>
   # Should show under "Status" that it's ready
   ```

3. **Verify Triton is running**
   ```bash
   kubectl get pods -l app=triton-server
   # Should show 3 replicas running
   kubectl logs -l app=triton-server --tail=50
   ```

4. **Test OPTIONS preflight directly**
   ```bash
   curl -X OPTIONS -v -k https://triton-route-<namespace>.apps.<cluster-domain>/v2/health/ready
   # Should return 200 OK with CORS headers
   ```

5. **Check TLS termination**
   - Your route uses `termination: edge` (TLS at the edge router)
   - If getting SSL certificate errors, you may need to trust the OpenShift CA cert
   - Or test with `https://` from within the cluster where certificates are different

---

## Alternative: If Pipe-Separator Doesn't Work

Some OpenShift versions prefer different HAProxy annotation syntax. If the above doesn't work, try the **alternative configuration** below:

See [session-route-ALTERNATIVE.yaml](session-route-ALTERNATIVE.yaml) for a version using individual annotations instead of pipes.

---

## Next Steps

1. **Apply the route** (`oc apply -f session-route.yaml`)
2. **Wait 30 seconds** for OpenShift to update HAProxy
3. **Test with your HTML client** using steps above
4. **Share browser console output** if still getting CORS errors
5. Once CORS is fixed, verify inference request returns correct Triton response

---

## Expected Success Behavior

When working correctly:
1. ✅ Health check shows "Server Ready (200 OK)"
2. ✅ Browser console shows no CORS errors
3. ✅ OPTIONS request returns 200 (seen in Network tab)
4. ✅ POST inference request returns 200 with model output
5. ✅ Response shows something like:
   ```json
   {
     "model_name": "image_classifier",
     "outputs": [
       {
         "name": "output_0",
         "shape": [...],
         "datatype": "FP32",
         "data": [...]
       }
     ]
   }
   ```

---

## Quick Reference: Your Route URL

- **Format:** `https://triton-route-<namespace>.apps.<cluster-domain>`
- **Example:** `https://triton-route-default.apps.ocp.example.com`
- **Find your actual URL:**
  ```bash
  oc get route triton-route -o jsonpath='{.spec.host}'
  ```

---

## Debugging Checklist

- [ ] Route applied: `oc apply -f session-route.yaml`
- [ ] Route is active: `oc get routes`
- [ ] Triton pods running: `kubectl get pods -l app=triton-server`
- [ ] Health endpoint accessible: `curl -k https://<route>/v2/health/ready`
- [ ] CORS headers in response: Check with curl `-v` flag
- [ ] Browser has no CORS errors: DevTools → Console
- [ ] HTML client connects successfully: See green status badge

---

**Questions?** Check browser console (F12) for detailed error messages and share them here.
