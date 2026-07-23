"""
Content Security Policy (CSP) Middleware for FastAPI

Sets CSP headers for production builds of the frontend.
Supports report-only mode via CSP_REPORT_ONLY environment variable.
"""

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def generate_csp_policy(is_dev: bool = False, report_only: bool = False) -> str:
    """
    Generate CSP policy string.
    
    Args:
        is_dev: Whether in development mode
        report_only: Whether to use report-only mode
    
    Returns:
        CSP policy string
    """
    # Base directives
    directives = {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': [],
    }
    
    # Script source
    if is_dev:
        directives['script-src'] = [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
        ]
    else:
        # Production: strict script-src (no unsafe-inline, no unsafe-eval)
        # Allow Cloudflare Insights for analytics
        directives['script-src'] = [
            "'self'",
            'https://static.cloudflareinsights.com',
        ]
    
    # Style source - allow unsafe-inline for React inline styles
    directives['style-src'] = [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
    ]
    
    # Font source
    directives['font-src'] = [
        "'self'",
        'https://fonts.gstatic.com',
        'data:',
    ]
    
    # Image source
    directives['img-src'] = [
        "'self'",
        'data:',
        'https:',
    ]
    
    # Connect source (Supabase auth + Google Tag Manager / Analytics +
    # GitHub API for the live community contributors / stars widgets)
    connect_src = [
        "'self'",
        'https://*.supabase.co',
        'https://*.supabase.io',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://www.google.com',
        'https://api.github.com',
    ]
    
    if is_dev:
        connect_src.extend([
            'http://localhost:*',
            'ws://localhost:*',
            'wss://localhost:*',
        ])
    
    directives['connect-src'] = connect_src
    
    # Frame source for Supabase auth
    directives['frame-src'] = [
        "'self'",
        'https://*.supabase.co',
    ]
    
    # Worker source
    directives['worker-src'] = ["'self'"]
    
    # Manifest source
    directives['manifest-src'] = ["'self'"]
    
    # Convert to CSP string
    csp_parts = []
    for directive, sources in directives.items():
        if sources:
            csp_parts.append(f"{directive} {' '.join(sources)}")
        else:
            csp_parts.append(directive)
    
    return '; '.join(csp_parts)


class CSPMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add Content Security Policy headers.
    
    Only applies CSP to HTML responses (frontend routes).
    Skips API routes and static assets.
    """
    
    def __init__(self, app, is_dev: bool = False):
        super().__init__(app)
        self.is_dev = is_dev
        self.report_only = os.getenv('CSP_REPORT_ONLY', 'false').lower() == 'true'
        self.csp_policy = generate_csp_policy(is_dev=is_dev, report_only=self.report_only)
        self.header_name = (
            'Content-Security-Policy-Report-Only' if self.report_only
            else 'Content-Security-Policy'
        )
        # Log CSP mode for debugging
        mode = "DEV" if is_dev else "PROD"
        report_mode = " (REPORT-ONLY)" if self.report_only else ""
        print(f"🔒 CSP Middleware initialized: {mode} mode{report_mode}")
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Only add CSP to HTML responses (frontend routes)
        # Skip API routes, static assets, and JSON responses
        content_type = response.headers.get('content-type', '').lower()
        path = request.url.path
        
        # Check if this is an HTML response
        # 1. Explicit HTML content type
        # 2. Root path or SPA routes (not API, assets, static, data)
        # 3. HTML file extensions
        # 4. FileResponse serving index.html (may not have content-type set yet)
        is_html = (
            'text/html' in content_type or
            path == '/' or
            path.endswith('.html') or
            (not path.startswith('/api/') and
             not path.startswith('/assets/') and
             not path.startswith('/static/') and
             not path.startswith('/data/') and
             not path.startswith('/docs') and
             (path.endswith('/') or path.count('/') <= 1))
        )
        
        if is_html and isinstance(response, Response):
            # Only set if not already set (allows override)
            if self.header_name not in response.headers:
                response.headers[self.header_name] = self.csp_policy
        
        return response

