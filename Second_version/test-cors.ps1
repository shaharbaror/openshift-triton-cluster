# PowerShell Script to Test Triton CORS Configuration
# Run this on Windows to quickly verify your CORS headers are working

param(
    [string]$RouteUrl = "",
    [string]$Namespace = "default",
    [switch]$SkipCertValidation = $true
)

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=" * 80
    Write-Host $Title
    Write-Host "=" * 80
}

function Test-TritonCORS {
    if ([string]::IsNullOrWhiteSpace($RouteUrl)) {
        # Try to auto-detect route
        Write-Host "Route URL not provided. Attempting to find it from OpenShift cluster..." -ForegroundColor Yellow
        
        try {
            $RouteUrl = oc get route triton-route -n $Namespace -o jsonpath='{.spec.host}' 2>$null
            if ([string]::IsNullOrWhiteSpace($RouteUrl)) {
                Write-Host "Could not auto-detect route URL. Please provide it manually:" -ForegroundColor Red
                Write-Host "  Usage: .\test-cors.ps1 -RouteUrl 'https://triton-route-namespace.apps.cluster.com'" -ForegroundColor Cyan
                return
            }
            $RouteUrl = "https://$RouteUrl"
            Write-Host "Auto-detected URL: $RouteUrl" -ForegroundColor Green
        }
        catch {
            Write-Host "Error auto-detecting URL. Please provide manually." -ForegroundColor Red
            return
        }
    }

    # Ensure HTTPS
    if (-not $RouteUrl.StartsWith("https://")) {
        $RouteUrl = "https://$RouteUrl"
    }

    Write-Section "TRITON CORS TESTING"
    Write-Host "Route URL: $RouteUrl" -ForegroundColor Cyan
    Write-Host "Namespace: $Namespace" -ForegroundColor Cyan
    Write-Host ""

    # Test 1: Health Check
    Write-Section "Test 1: Health Check (GET /v2/health/ready)"
    try {
        $params = @{
            Uri     = "$RouteUrl/v2/health/ready"
            Method  = "GET"
            Headers = @{
                "Content-Type" = "application/json"
            }
        }
        
        if ($SkipCertValidation) {
            $params["SkipCertificateCheck"] = $true
        }

        Write-Host "Sending GET request..." -ForegroundColor Cyan
        $response = Invoke-WebRequest @params
        
        Write-Host "✅ Status Code: $($response.StatusCode)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Response Headers:" -ForegroundColor Yellow
        $response.Headers.GetEnumerator() | ForEach-Object {
            $corsHeaders = @(
                "access-control-allow-origin",
                "access-control-allow-methods",
                "access-control-allow-headers",
                "access-control-max-age"
            )
            if ($corsHeaders -contains $_.Key.ToLower()) {
                Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor Green
            } else {
                Write-Host "  $($_.Key): $($_.Value)"
            }
        }
    }
    catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }

    # Test 2: OPTIONS Preflight
    Write-Section "Test 2: OPTIONS Preflight Request"
    try {
        $params = @{
            Uri     = "$RouteUrl/v2/models/image_classifier/infer"
            Method  = "OPTIONS"
            Headers = @{
                "Origin"                        = "http://localhost:3000"
                "Access-Control-Request-Method" = "POST"
                "Access-Control-Request-Headers"= "Content-Type"
            }
        }
        
        if ($SkipCertValidation) {
            $params["SkipCertificateCheck"] = $true
        }

        Write-Host "Sending OPTIONS preflight request..." -ForegroundColor Cyan
        $response = Invoke-WebRequest @params
        
        Write-Host "✅ Status Code: $($response.StatusCode)" -ForegroundColor Green
        Write-Host ""
        Write-Host "CORS Response Headers:" -ForegroundColor Yellow
        
        $corsFound = $false
        $response.Headers.GetEnumerator() | ForEach-Object {
            if ($_.Key.ToLower().StartsWith("access-control")) {
                Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor Green
                $corsFound = $true
            }
        }
        
        if (-not $corsFound) {
            Write-Host "  ⚠️  No CORS headers found in OPTIONS response" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️  OPTIONS request failed (expected on some configurations): $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # Test 3: POST Inference (Optional - requires valid model)
    Write-Section "Test 3: Inference POST Request (Optional)"
    
    $inferencePayload = @{
        inputs = @(
            @{
                name = "input_0"
                shape = @(1, 3, 224, 224)
                datatype = "FP32"
                data = (0..150527 | ForEach-Object { [random]::new().NextDouble() })
            }
        )
    } | ConvertTo-Json -Depth 10

    try {
        $params = @{
            Uri     = "$RouteUrl/v2/models/image_classifier/infer"
            Method  = "POST"
            Headers = @{
                "Content-Type" = "application/json"
            }
            Body    = $inferencePayload
        }
        
        if ($SkipCertValidation) {
            $params["SkipCertificateCheck"] = $true
        }

        Write-Host "Sending POST inference request..." -ForegroundColor Cyan
        $response = Invoke-WebRequest @params
        
        Write-Host "✅ Status Code: $($response.StatusCode)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Response (first 500 chars):" -ForegroundColor Yellow
        Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json).Substring(0, [Math]::Min(500, $response.Content.Length))
    }
    catch {
        Write-Host "⚠️  POST request failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "This is expected if the model hasn't been deployed yet." -ForegroundColor Gray
    }

    # Summary
    Write-Section "CORS Verification Summary"
    Write-Host ""
    Write-Host "✅ If you see CORS headers above, your configuration is correct!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Expected headers:" -ForegroundColor Cyan
    Write-Host "  - Access-Control-Allow-Origin: *"
    Write-Host "  - Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE"
    Write-Host "  - Access-Control-Allow-Headers: Content-Type, Accept, Authorization"
    Write-Host "  - Access-Control-Max-Age: 3600"
    Write-Host ""
    Write-Host "If headers are missing:" -ForegroundColor Yellow
    Write-Host "  1. OpenShift route may need 30-60 seconds to update"
    Write-Host "  2. Try applying the ALTERNATIVE configuration:"
    Write-Host "     oc apply -f session-route-ALTERNATIVE.yaml"
    Write-Host "  3. Check route status: oc describe route triton-route"
    Write-Host ""
}

# Run the test
Test-TritonCORS
