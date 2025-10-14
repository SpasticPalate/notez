#!/usr/bin/env pwsh

Write-Host "=== Testing Authentication System with Qodo Fixes ===" -ForegroundColor Cyan

# Test 1: Check setup status
Write-Host "`n1. Checking if setup is needed..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/setup-needed" -Method GET
    Write-Host "Setup needed: $($response.setupNeeded)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Login (assuming admin user already exists from previous tests)
Write-Host "`n2. Logging in as admin..." -ForegroundColor Yellow
try {
    $loginBody = @{
        usernameOrEmail = "admin"
        password = "Admin123!@#"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -SessionVariable session
    $accessToken = $loginResponse.accessToken
    Write-Host "Login successful! User: $($loginResponse.user.username)" -ForegroundColor Green
    Write-Host "Access token obtained (first 50 chars): $($accessToken.Substring(0, [Math]::Min(50, $accessToken.Length)))..." -ForegroundColor Gray
} catch {
    Write-Host "Error: $($_.Exception.Response.StatusCode) - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 3: Get current user info
Write-Host "`n3. Getting current user info..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $accessToken"
    }
    $userInfo = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" -Method GET -Headers $headers
    Write-Host "Current user: $($userInfo.user.username) (Role: $($userInfo.user.role))" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: List all users
Write-Host "`n4. Listing all users..." -ForegroundColor Yellow
try {
    $users = Invoke-RestMethod -Uri "http://localhost:3000/api/users" -Method GET -Headers $headers
    Write-Host "Total users: $($users.users.Count)" -ForegroundColor Green
    foreach ($user in $users.users) {
        Write-Host "  - $($user.username) ($($user.email)) - Role: $($user.role)" -ForegroundColor Gray
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Get user statistics
Write-Host "`n5. Getting user statistics..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/api/users/stats" -Method GET -Headers $headers
    Write-Host "User statistics:" -ForegroundColor Green
    Write-Host "  - Total users: $($stats.totalUsers)" -ForegroundColor Gray
    Write-Host "  - Active users: $($stats.activeUsers)" -ForegroundColor Gray
    Write-Host "  - Inactive users: $($stats.inactiveUsers)" -ForegroundColor Gray
    Write-Host "  - Admin users: $($stats.adminUsers)" -ForegroundColor Gray
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Logout
Write-Host "`n6. Testing logout (should invalidate ALL sessions)..." -ForegroundColor Yellow
try {
    $logoutResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/logout" -Method POST -Headers $headers -WebSession $session -ContentType "application/json" -Body "{}"
    Write-Host "Logout successful: $($logoutResponse.message)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Verify refresh token was invalidated
Write-Host "`n7. Verifying refresh token was invalidated..." -ForegroundColor Yellow
Write-Host "NOTE: Access tokens are JWT-based and will work until expiry (1hr). Logout invalidates refresh tokens." -ForegroundColor Gray
try {
    $refreshResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/refresh" -Method POST -WebSession $session -ContentType "application/json" -Body "{}"
    Write-Host "ERROR: Refresh token should have been invalidated but still works!" -ForegroundColor Red
} catch {
    Write-Host "Confirmed: Refresh token was invalidated successfully (cannot get new access token)" -ForegroundColor Green
}

Write-Host "`n=== All tests completed ===" -ForegroundColor Cyan
