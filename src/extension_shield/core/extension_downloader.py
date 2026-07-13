"""
Chrome Extension Downloader
Downloads Chrome extensions from the Chrome Web Store as CRX or ZIP files
"""

import os
import logging
from typing import Optional, Dict
from datetime import datetime
from dotenv import load_dotenv
from extension_shield.utils.extension import calculate_file_hash, extract_extension_id_by_url
from extension_shield.core.config import get_settings
from extension_shield.utils.http_safety import safe_get

load_dotenv()
logger = logging.getLogger(__name__)


class ExtensionDownloader:
    """Downloads Chrome extensions from the Chrome Web Store"""

    def __init__(self):
        self.extension_storage_path = get_settings().extension_storage_path

    @staticmethod
    def _get_chrome_headers() -> Dict[str, str]:
        """Chrome-like headers required by clients2.google.com to avoid blocking/HTML error pages."""
        return {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "application/x-chrome-extension,*/*",
        }

    @staticmethod
    def _get_download_url(extension_id: str) -> str:
        """
        Constructs the download URL for the given extension ID

        Args:
            extension_id (str): The ID of the Chrome
            extension to download
        Returns:
            str: The download URL for the extension
        """
        chrome_version = os.getenv("CHROME_VERSION", "131.0.0.0")
        download_url = (
            "https://clients2.google.com/service/update2/crx"
            f"?response=redirect&prodversion={chrome_version}"
            "&acceptformat=crx2%2Ccrx3"
            f"&x=id%3D{extension_id}%26uc"
        )
        return download_url

    # User-Agent sent when downloading from Chrome Web Store (server IPs often get HTML without it)
    CHROME_USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/118.0.0.0 Safari/537.36"
    )

    def _download(self, extension_id: str, download_url: str) -> Optional[Dict]:
        """
        Downloads the extension from the given URL

        Args:
            download_url (str): The URL to download the extension from
        Returns:
            Optional[Dict]: A dictionary containing the extension's metadata and file
                content, or None if download fails
        """
        try:
            logger.info("Downloading extension %s from %s", extension_id, download_url)
            filename = f"{extension_id}.crx"
            file_path = os.path.join(self.extension_storage_path, filename)
            os.makedirs(self.extension_storage_path, exist_ok=True)

            # Only allow clients2.google.com (SSRF). Chrome-like headers avoid HTML/204.
            # Extensions can be large (AdBlock is ~75MB), so raise the default 25MB
            # limit. Change it with MAX_CRX_BYTES.
            ALLOWED_HOSTS = {"clients2.google.com"}
            headers = {"User-Agent": ExtensionDownloader.CHROME_USER_AGENT}
            max_crx_bytes = int(os.getenv("MAX_CRX_BYTES", str(200 * 1024 * 1024)))  # 200MB
            response = safe_get(
                download_url,
                allowed_hosts=ALLOWED_HOSTS,
                stream=True,
                timeout=120,
                headers=headers,
                max_bytes=max_crx_bytes,
            )
            response.raise_for_status()

            content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
            # Chrome Web Store may return CRX, octet-stream, zip, or empty (server IPs often get empty)
            allowed_types = (
                "application/x-chrome-extension",
                "application/octet-stream",
                "application/zip",
                "application/crx",
            )
            if content_type:
                if "text/html" in content_type or content_type.startswith("text/"):
                    logger.warning(
                        "Unexpected content type: %s (likely blocked or consent page)", content_type
                    )
                    return None
                if not any(t in content_type for t in allowed_types):
                    logger.warning("Unexpected content type: %s", content_type)

            # Save the file, and stop if it goes over the limit while streaming
            # (the Content-Length header is not always present).
            written = 0
            oversized = False
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if not chunk:
                        continue
                    written += len(chunk)
                    if written > max_crx_bytes:
                        oversized = True
                        break
                    f.write(chunk)

            if oversized:
                # Discard the truncated file so it is never treated as a valid CRX.
                logger.error(
                    "Download exceeded max size (%s bytes) for %s; discarding.",
                    max_crx_bytes, extension_id,
                )
                if os.path.exists(file_path):
                    os.remove(file_path)
                return None

            file_size = os.path.getsize(file_path)
            logger.info("Downloaded %s to %s (%s bytes)", extension_id, file_path, file_size)

            # Validate file size - Chrome extensions should be at least a few KB
            if file_size < 1024:
                logger.error(
                    "Downloaded file too small (%s bytes) for %s - likely HTML error page or 204. "
                    "Check CHROME_VERSION and User-Agent.", file_size, extension_id,
                )
                if os.path.exists(file_path):
                    os.remove(file_path)
                return None

            return {
                "extension_id": extension_id,
                "file_path": file_path,
                "file_size": file_size,
                "download_url": download_url,
            }
        except Exception as exc:
            logger.error("Failed to download from %s: %s", download_url, exc)
            return None

    def download_extension(self, extension_url: str) -> Optional[Dict]:
        """
        Downloads the Chrome extension with the given Chrome Web Store URL

        Args:
            extension_url (str): The URL of the Chrome extension to download

        Returns:
            Optional[Dict]: A dictionary containing the extension's metadata, or None
                if download fails
        """
        try:
            extension_id = extract_extension_id_by_url(extension_url)
            if not extension_id:
                logger.warning("Could not extract valid extension ID from URL: %s", extension_url[:80])
                return None
            download_url = self._get_download_url(extension_id)
            file_info = self._download(extension_id, download_url)
            if not file_info:
                logger.error("Failed to download extension %s", extension_id)
                return None

            file_hash = calculate_file_hash(file_info["file_path"])
            if not file_hash:
                logger.error("Failed to calculate hash for extension %s", extension_id)
                return None

            file_info["file_hash"] = file_hash
            file_info["download_date"] = datetime.now().strftime("%Y%m%d_%H%M%S")
            return file_info

        except Exception as exc:
            logger.error("Failed to download extension %s: %s", extension_url, exc)
            return None


if __name__ == "__main__":
    # Test the downloader
    test_downloader = ExtensionDownloader()

    EXTENSION_URL = "https://chromewebstore.google.com/detail/2048/ijkmjnaahlnmdjjlbhbjbhlnmadmmlgg"

    result = test_downloader.download_extension(extension_url=EXTENSION_URL)
    if result:
        print(f"Download successful: {result}")
    else:
        print("Download failed")
