#!/usr/bin/env bash
# Seed an isolated job-search workspace in the run's temporary HOME: the example
# profile from evals/fixtures/profile.json (no real person) and two saved postings.
# Generated — keep identical to the fixture (tests/plugin-evals.test.ts).
set -euo pipefail
WS="$HOME/.local/share/job-search"
mkdir -p "$WS/data/jd"
cat > "$WS/data/profile.json" <<'PROFILE'
{
  "identity": {
    "name": "Alex Rivera",
    "email": "alex@example.com",
    "phone": "+1 555 0100",
    "location": "Remote",
    "linkedin": "https://linkedin.com/in/alex",
    "blog": "https://portfolio.example.com",
    "languages": [
      "English"
    ]
  },
  "skills": [
    {
      "category": "Automation",
      "skills": [
        "Python",
        "Terraform"
      ]
    }
  ],
  "experience": [
    {
      "title": "Platform Engineer",
      "company": "Example Labs",
      "startDate": "2022",
      "endDate": "Present",
      "achievements": [
        "Automated cloud environment delivery with Python and Terraform."
      ],
      "responsibilities": [
        "Maintained deployment tooling with the security team."
      ]
    }
  ],
  "education": [
    {
      "degree": "BSc",
      "field": "Computer Science",
      "institution": "Example University",
      "endYear": 2021
    }
  ],
  "certifications": [
    {
      "name": "Cloud Fundamentals",
      "date": "2023"
    }
  ],
  "projects": [
    {
      "slug": "delivery-pipeline",
      "name": "Delivery Pipeline",
      "kind": "work",
      "summary": "Reusable deployment pipeline for platform teams.",
      "domains": [
        "devops-platform",
        "automation"
      ],
      "stack": [
        "Python",
        "Terraform"
      ],
      "link": "https://example.com/delivery-pipeline"
    }
  ]
}
PROFILE
printf '%s\n' "Platform Engineer at Example. Remote within Germany. Requirements: Python, Terraform, Kubernetes. Build secure delivery automation." > "$WS/data/jd/example-platform.txt"
printf '%s\n' "Pastry Chef at Boulangerie. Onsite in Paris, France. Requirements: French pastry, lamination, sourdough." > "$WS/data/jd/boulangerie-pastry.txt"
