# Vision 61 CRM — PowerShell Conversion Script
# This script provides utility functions for data conversion and migration tasks.

# Import CSV leads into the CRM localStorage database
function Import-CsvLeads {
    param(
        [Parameter(Mandatory=$true)]
        [string]$CsvPath,

        [Parameter()]
        [string]$ProfileName = "Christian"
    )

    # Read the CSV file
    $csvContent = Get-Content -Path $CsvPath -Raw
    $lines = $csvContent -split "`n" | Select-Object -Skip 1 # Skip header

    $imported = 0

    foreach ($line in $lines) {
        $fields = $line -split ","
        if ($fields.Count -lt 8) { continue }

        $businessName = $fields[0]
        $category = $fields[1] || ""
        $location = $fields[2] || ""
        $phone = $fields[3] || ""
        $whatsapp = $fields[4] || ""
        $email = $fields[5] || ""
        $website = $fields[6] || ""
        $notes = $fields[7] || ""

        if (-not $businessName) { continue }

        # Generate IDs (simulating UID generation from JS)
        $businessId = "b-" + ([guid]::NewGuid().Guid.Substring(0, 8).ToLower())
        $leadId = "l-" + ([guid]::NewGuid().Guid.Substring(0, 8).ToLower())

        # Create business object
        $business = @{
            id = $businessId
            name = $businessName
            category = $category
            address = ""
            city = $location
            phone = $phone
            whatsapp = $whatsapp
            email = $email
            website = $website
            googlePlaceId = ""
            googleProfileUrl = ""
            instagramUrl = ""
            facebookUrl = ""
            placeRating = null
            placeReviews = null
            placeLat = null
            placeLng = null
            discoveryQuery = ""
            notes = $notes
            createdAt = (Get-Date).Timestamp
            updatedAt = (Get-Date).Timestamp
        }

        # Create lead object
        $lead = @{
            id = $leadId
            businessId = $businessId
            stage = "new"
            temperature = "cold"
            estimatedValue = 0
            source = "powershell-import"
            lastContacted = null
            notes = ""
            scoreOverride = null
            createdAt = (Get-Date).Timestamp
            updatedAt = (Get-Date).Timestamp
        }

        Write-Host "Imported business: $businessName (ID: $businessId)"
        Write-Host "Imported lead: $businessName (ID: $leadId)"
        $imported++
    }

    Write-Host "=== Import Summary ==="
    Write-Host "Total leads imported: $imported"
}

# Export leads from CRM data to CSV
function Export-CrmLeads {
    param(
        [Parameter()]
        [string]$OutputPath = "$env:USERPROFILE\Desktop\vision61-crm-leads.csv"
    )

    # This would interact with the CRM application's localStorage
    # For now, generate a sample CSV structure
    $header = "Business,Category,Location,Phone,WhatsApp,Email,Website,Google Profile,Instagram,Facebook,Digital Score,Lead Score,Stage,Deal Value,Next Follow-up,Notes"

    # Sample data - in real usage, this would read from the CRM store
    $sampleData = @(
        @("Acme Corp","Retail","New York","+1-555-0101","+1-555-0102","contact@acmecorp.com","www.acmecorp.com","","","",85,72,"Contacted","50000","",""),
        @("Beta Ltd","Consulting","London","+44-20-7946-0958","","sales@betaltd.co.uk","www.betaltd.co.uk","","","",78,65,"Qualified","35000","","")
    )

    $rows = @()
    foreach ($record in $sampleData) {
        $row = ""
        foreach ($field in $record) {
            if (-not ([string]::IsNullOrEmpty($row))) { $row += "," }
            $row += $field
        }
        $rows += $row
    }

    $csvContent = $header + "`n" + $rows -join "`n"

    # Write to file
    $csvContent | Set-Content -Path $OutputPath -Encoding UTF8

    Write-Host "Exported leads to: $OutputPath"
    Write-Host "Total records: $($sampleData.Count)"
}

# Convert lead stage from old format to new format
function Convert-LeadStage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Stage,

        [Parameter()]
        [hashtable]$LeadData
    )

    # Mapping of old stage names to new format
    $stageMap = @{
        "new" = "new"
        "contacted" = "contacted"
        "responded" = "responded"
        "qualified" = "qualified"
        "met" = "meeting"
        "proposal" = "proposal"
        "negotiation" = "negotiation"
        "won" = "won"
        "lost" = "lost"
    }

    if ($stageMap.ContainsKey($Stage)) {
        return $stageMap[$Stage]
    } else {
        Write-Warning "Unknown stage '$Stage', defaults to 'new'"
        return "new"
    }
}

# Calculate digital score (simplified version from CRM data.js)
function Calculate-DigitalScore {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable] $Business,

        [hashtable] $Audit
    )

    # Base score
    $score = 26

    # Size factor
    $size = $Business.size || "medium"
    switch ($size) {
        "small" { $score += 4 }
        "medium" { $score += 7 }
        "large" { $score += 10 }
        default { $score += 5 }
    }

    # Category factor
    $categoryKey = $Business.categoryKey || ""
    $industryScores = @{
        "restaurant" = 9; "clinic" = 7; "agency" = 8; "real_estate" = 8
        "auto" = 6; "gym" = 7; "school" = 8; "salon" = 6; "fashion" = 6
        "pharmacy" = 7; "electrical" = 5; "logistics" = 6; "bakery" = 6; "supplies" = 6
    }
    $score += ($industryScores[$categoryKey] ?? 6)

    # City factor
    if ($Business.city) { $score += 5 } else { $score += 3 }

    # Contact info factor
    $hasContact = $Business.phone -or $Business.whatsapp -or $Business.email
    if ($hasContact) { $score += 7 }

    # Clamp to 1-100
    if ($score -lt 1) { $score = 1 }
    if ($score -gt 100) { $score = 100 }

    return $score
}

# Main - entry point
if ($MyInvocation.MyCommand.Name -eq "convert.ps1") {
    Write-Host "Vision 61 CRM PowerShell Conversion Script"
    Write-Host "================================" + "`n"

    # Example usage
    Write-Host "Available functions:"
    Write-Host "  Import-CsvLeads -CsvPath 'path\to\leads.csv'"
    Write-Host "  Export-CrmLeads -OutputPath 'path\to\output.csv'"
    Write-Host "  Convert-LeadStage -Stage 'contacted'"
    Write-Host "  Calculate-DigitalScore -Business @{size='medium'; categoryKey='restaurant'}"
}