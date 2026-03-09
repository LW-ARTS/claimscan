#!/usr/bin/env python3
"""
ClaimScan Whitepaper V1 PDF Generator
Brutalist monochrome aesthetic matching the website
"""

import os
import tempfile
from PIL import Image, ImageOps
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    Frame, PageTemplate, BaseDocTemplate, Flowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Line, Circle, String
from reportlab.graphics import renderPDF

# ============================================================
# CONSTANTS
# ============================================================
OUTPUT_PATH = "/Users/lowellmuniz/Projects/claimscan/public/ClaimScan-Whitepaper-V1.pdf"

# Logo paths
CLAIMSCAN_LOGO = "/Users/lowellmuniz/Downloads/VKSAJHDJ.png"
LW_LOGO = "/Users/lowellmuniz/Downloads/LWARTSpng.png"

# Generate processed logo variants at runtime
_lw_black_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
LW_LOGO_BLACK = _lw_black_tmp.name
_lw_black_tmp.close()

_cs_transparent_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
CLAIMSCAN_LOGO_TRANSPARENT = _cs_transparent_tmp.name
_cs_transparent_tmp.close()

_cs_black_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
CLAIMSCAN_LOGO_BLACK = _cs_black_tmp.name
_cs_black_tmp.close()


def _create_black_lw_logo():
    """Convert white-on-transparent LW logo to black-on-transparent"""
    img = Image.open(LW_LOGO).convert("RGBA")
    r, g, b, a = img.split()
    black_r = r.point(lambda _: 0)
    black_g = g.point(lambda _: 0)
    black_b = b.point(lambda _: 0)
    black_img = Image.merge("RGBA", (black_r, black_g, black_b, a))
    black_img.save(LW_LOGO_BLACK, "PNG")


def _create_transparent_claimscan_logo():
    """Remove black square background from ClaimScan logo.
    Creates: white-on-transparent (for dark bg) and black-on-transparent (for light bg)."""
    img = Image.open(CLAIMSCAN_LOGO).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            brightness = (r + g + b) / 3
            if brightness < 30:
                # Black background -> fully transparent
                pixels[x, y] = (255, 255, 255, 0)
            elif brightness > 225:
                # White content -> keep white, fully opaque
                pixels[x, y] = (255, 255, 255, 255)
            else:
                # Anti-aliased edge -> white with proportional alpha
                alpha = int((brightness / 255) * 255)
                pixels[x, y] = (255, 255, 255, alpha)

    img.save(CLAIMSCAN_LOGO_TRANSPARENT, "PNG")

    # Black version for light backgrounds
    pixels2 = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels2[x, y]
            if a > 0:
                pixels2[x, y] = (10, 10, 10, a)  # #0A0A0A matching BLACK constant
    img.save(CLAIMSCAN_LOGO_BLACK, "PNG")


_create_black_lw_logo()
_create_transparent_claimscan_logo()

# Colors - Brutalist Monochrome
BLACK = HexColor("#0A0A0A")
NEAR_BLACK = HexColor("#111111")
DARK_GRAY = HexColor("#1A1A1A")
MID_DARK = HexColor("#222222")
MID_GRAY = HexColor("#333333")
GRAY = HexColor("#666666")
LIGHT_GRAY = HexColor("#999999")
LIGHTER_GRAY = HexColor("#CCCCCC")
OFF_WHITE = HexColor("#E8E8E8")
NEAR_WHITE = HexColor("#F5F5F5")
WHITE_BG = HexColor("#FAFAFA")

# Platform colors
PUMP_COLOR = HexColor("#00D4AA")
BAGS_COLOR = HexColor("#FF6B35")
HEAVEN_COLOR = HexColor("#FFD700")
BELIEVE_COLOR = HexColor("#E91E63")
REVSHARE_COLOR = HexColor("#4CAF50")
COINBARREL_COLOR = HexColor("#FF8C00")
RAYDIUM_COLOR = HexColor("#6C5CE7")
CLANKER_COLOR = HexColor("#0052FF")
ZORA_COLOR = HexColor("#5B5BD6")
BANKR_COLOR = HexColor("#1DA1F2")

PAGE_W, PAGE_H = letter
MARGIN = 0.75 * inch


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def draw_dot_grid(c, x_start, y_start, x_end, y_end, spacing=20, radius=0.5, color=None):
    """Draw subtle dot grid pattern"""
    if color is None:
        color = HexColor("#E0E0E0")
    c.setFillColor(color)
    x = x_start
    while x < x_end:
        y = y_start
        while y < y_end:
            c.circle(x, y, radius, fill=1, stroke=0)
            y += spacing
        x += spacing


def draw_thick_rule(c, y, color=BLACK, thickness=2):
    """Draw a thick horizontal rule"""
    c.setStrokeColor(color)
    c.setLineWidth(thickness)
    c.line(MARGIN, y, PAGE_W - MARGIN, y)


def draw_thin_rule(c, y, color=LIGHTER_GRAY, thickness=0.5):
    """Draw a thin horizontal rule"""
    c.setStrokeColor(color)
    c.setLineWidth(thickness)
    c.line(MARGIN, y, PAGE_W - MARGIN, y)


def draw_page_number(c, page_num, color=None):
    """Draw page number at bottom center. Color defaults to LIGHT_GRAY for light pages."""
    if color is None:
        color = LIGHT_GRAY
    c.setFont("Helvetica", 8)
    c.setFillColor(color)
    c.drawCentredString(PAGE_W / 2, 0.4 * inch, str(page_num))


def draw_header_bar(c, text, y, height=30):
    """Draw a black bar with white text (section header)"""
    c.setFillColor(BLACK)
    c.rect(MARGIN, y - height + 5, PAGE_W - 2 * MARGIN, height, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN + 12, y - height + 15, text.upper())


def draw_stat_box(c, x, y, w, h, number, label):
    """Draw a stat callout box"""
    c.setStrokeColor(BLACK)
    c.setLineWidth(1.5)
    c.setFillColor(WHITE_BG)
    c.rect(x, y, w, h, fill=1, stroke=1)

    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(x + w/2, y + h - 30, number)

    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(x + w/2, y + 10, label.upper())


def draw_inverted_stat_box(c, x, y, w, h, number, label):
    """Draw an inverted (black bg) stat callout box"""
    c.setFillColor(BLACK)
    c.rect(x, y, w, h, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(x + w/2, y + h - 30, number)

    c.setFillColor(LIGHTER_GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(x + w/2, y + 10, label.upper())


def draw_step_number(c, x, y, num):
    """Draw a numbered step indicator"""
    c.setFillColor(BLACK)
    c.circle(x, y, 14, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(x, y - 4, str(num))


def draw_claimscan_logo(c, cx, cy, size=80):
    """Draw the ClaimScan logo (white on transparent) for dark backgrounds"""
    half = size / 2
    c.drawImage(CLAIMSCAN_LOGO_TRANSPARENT, cx - half, cy - half, size, size,
                preserveAspectRatio=True, mask='auto')


def draw_claimscan_logo_on_light(c, cx, cy, size=80):
    """Draw the ClaimScan logo (black on transparent) for light backgrounds"""
    half = size / 2
    c.drawImage(CLAIMSCAN_LOGO_BLACK, cx - half, cy - half, size, size,
                preserveAspectRatio=True, mask='auto')


def draw_lw_logo(c, cx, cy, size=50):
    """Draw the official LW ARTS flame logo centered at cx, cy.
    The PNG is white on transparent, works on dark backgrounds.
    For light backgrounds, use draw_lw_logo_on_light instead."""
    half = size / 2
    c.drawImage(LW_LOGO, cx - half, cy - half, size, size,
                preserveAspectRatio=True, mask='auto')


def draw_lw_logo_on_light(c, cx, cy, size=50):
    """Draw LW logo on light background using the black version (no circle)"""
    half = size / 2
    c.drawImage(LW_LOGO_BLACK, cx - half, cy - half, size, size,
                preserveAspectRatio=True, mask='auto')


def wrap_text(c, text, x, y, max_width, font_name, font_size, line_height, color=BLACK):
    """Simple text wrapping helper"""
    c.setFont(font_name, font_size)
    c.setFillColor(color)
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test = current_line + " " + word if current_line else word
        if c.stringWidth(test, font_name, font_size) <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)

    for i, line in enumerate(lines):
        c.drawString(x, y - i * line_height, line)

    return y - len(lines) * line_height


def draw_bullet_item(c, x, y, title, desc, max_width, title_font_size=10, desc_font_size=9):
    """Draw a bullet point with bold title and description"""
    # Bullet dot
    c.setFillColor(BLACK)
    c.circle(x + 3, y + 3, 2.5, fill=1, stroke=0)

    # Title
    c.setFont("Helvetica-Bold", title_font_size)
    c.setFillColor(BLACK)
    c.drawString(x + 14, y, title)

    # Description
    if desc:
        ty = y - 14
        ty = wrap_text(c, desc, x + 14, ty, max_width - 14, "Helvetica", desc_font_size, 12, GRAY)
        return ty - 6
    return y - 20


def draw_check_item(c, x, y, text, color=BLACK):
    """Draw a checkmark item"""
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, ">>")
    c.setFont("Helvetica", 10)
    c.setFillColor(color)
    c.drawString(x + 18, y, text)
    return y - 18


# ============================================================
# PAGE GENERATORS
# ============================================================

def page_cover(c):
    """PAGE 1 - Cover"""
    # Full black background
    c.setFillColor(BLACK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Subtle dot grid
    draw_dot_grid(c, MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN,
                  spacing=30, radius=0.3, color=HexColor("#1A1A1A"))

    # Top rule
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.5)
    c.line(MARGIN, PAGE_H - 1.2*inch, PAGE_W - MARGIN, PAGE_H - 1.2*inch)

    # Version tag top-right
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.0*inch, "WHITEPAPER V1.0")

    # Date top-left
    c.drawString(MARGIN, PAGE_H - 1.0*inch, "MARCH 2026")

    # ClaimScan official logo (centered, large)
    cx = PAGE_W / 2
    cy = PAGE_H / 2 + 1.2*inch
    draw_claimscan_logo(c, cx, cy, size=120)

    # Title
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 52)
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 - 0.5*inch, "CLAIMSCAN")

    # Subtitle
    c.setFont("Helvetica", 14)
    c.setFillColor(LIGHTER_GRAY)
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 - 1.0*inch, "RECOVER YOUR UNCLAIMED CREATOR FEES")

    # Thin line separator
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.5)
    c.line(PAGE_W/2 - 1.5*inch, PAGE_H/2 - 1.3*inch, PAGE_W/2 + 1.5*inch, PAGE_H/2 - 1.3*inch)

    # Description
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 - 1.7*inch, "Stop leaving money on the table.")
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 - 1.9*inch, "10 platforms. 2 chains. One search.")

    # Bottom section
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.5)
    c.line(MARGIN, 1.5*inch, PAGE_W - MARGIN, 1.5*inch)

    # LW Team attribution with official logo
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W / 2, 1.25*inch, "A PRODUCT BY")

    # LW flame logo (white on dark bg, with breathing room above text)
    draw_lw_logo(c, PAGE_W / 2, 0.85*inch, size=40)

    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W / 2, 0.38*inch, "lwdesigns.art")


def page_toc(c):
    """PAGE 2 - Table of Contents"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Subtle dot grid
    draw_dot_grid(c, MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN,
                  spacing=25, radius=0.3, color=HexColor("#F0F0F0"))

    y = PAGE_H - 1.2*inch

    # Section label
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "01")

    # Title
    c.setFont("Helvetica-Bold", 36)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 30, "TABLE OF")
    c.drawString(MARGIN, y - 70, "CONTENTS")

    draw_thick_rule(c, y - 90)

    # TOC entries
    entries = [
        ("01", "Introduction", "Your Money Is Waiting"),
        ("02", "The Problem", "Why Creators Lose Fees"),
        ("03", "The Solution", "One Search. Every Dollar."),
        ("04", "How It Works", "From Handle to Fees in 30s"),
        ("05", "Supported Platforms", "10 Platforms, 2 Chains"),
        ("06", "Architecture", "Engineered for Speed"),
        ("07", "Security & Privacy", "Your Privacy, Protected"),
        ("08", "Roadmap", "V1 Is Just the Start"),
        ("09", "Team", "The Team Behind ClaimScan"),
    ]

    y = y - 130
    content_w = PAGE_W - 2 * MARGIN

    for num, title, subtitle in entries:
        # Number
        c.setFont("Helvetica-Bold", 24)
        c.setFillColor(BLACK)
        c.drawString(MARGIN, y, num)

        # Title
        c.setFont("Helvetica-Bold", 14)
        c.drawString(MARGIN + 50, y + 4, title.upper())

        # Subtitle
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY)
        c.drawString(MARGIN + 50, y - 12, subtitle)

        # Dotted line
        c.setStrokeColor(LIGHTER_GRAY)
        c.setLineWidth(0.3)
        c.setDash(1, 3)
        title_w = c.stringWidth(title.upper(), "Helvetica-Bold", 14)
        c.line(MARGIN + 55 + title_w, y + 6, PAGE_W - MARGIN, y + 6)
        c.setDash()

        # Thin separator
        y -= 38
        if num != "09":
            c.setStrokeColor(OFF_WHITE)
            c.setLineWidth(0.3)
            c.line(MARGIN + 50, y + 14, PAGE_W - MARGIN, y + 14)

    draw_page_number(c, 2)


def page_introduction(c):
    """PAGE 3 - Introduction"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 01")

    # Title + ClaimScan logo
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "WHAT IS")
    c.drawString(MARGIN, y - 55, "CLAIMSCAN?")

    # ClaimScan logo icon top-right (black version for white bg)
    draw_claimscan_logo_on_light(c, PAGE_W - MARGIN - 30, y - 25, size=55)

    draw_thick_rule(c, y - 75)

    y = y - 110

    # Intro paragraph - upgraded copy
    intro = ("Every day, creators leave thousands of dollars unclaimed across DeFi. "
             "ClaimScan is the first cross-chain fee recovery tool built for creators. "
             "It scans 10 launchpads across Solana and Base in real time, "
             "surfacing every dollar you've earned, claimed, and left behind.")
    y = wrap_text(c, intro, MARGIN, y, content_w, "Helvetica", 11, 16, MID_GRAY)

    y -= 15

    quote = ("Your fees are sitting unclaimed right now. ClaimScan finds them. "
             "10 platforms. 2 chains. Zero excuses.")

    # Quote box
    c.setFillColor(NEAR_WHITE)
    c.rect(MARGIN, y - 48, content_w, 55, fill=1, stroke=0)
    c.setStrokeColor(BLACK)
    c.setLineWidth(3)
    c.line(MARGIN, y - 48, MARGIN, y + 7)

    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(MID_GRAY)
    c.drawString(MARGIN + 15, y - 5, quote[:70])
    c.drawString(MARGIN + 15, y - 19, quote[70:])

    y -= 80

    # Stats section header
    draw_header_bar(c, "KEY METRICS", y, 28)
    y -= 50

    # Stats grid - 2 rows of 3
    box_w = (content_w - 20) / 3
    box_h = 65
    gap = 10

    stats_row1 = [
        ("10", "PLATFORMS TRACKED"),
        ("2", "BLOCKCHAINS"),
        ("~40%", "FEES UNCLAIMED"),
    ]

    for i, (num, label) in enumerate(stats_row1):
        bx = MARGIN + i * (box_w + gap)
        draw_inverted_stat_box(c, bx, y - box_h, box_w, box_h, num, label)

    y -= box_h + gap + 5

    stats_row2 = [
        ("<30s", "SCAN TIME"),
        ("FREE", "ALWAYS"),
        ("24/7", "LIVE TRACKING"),
    ]

    for i, (num, label) in enumerate(stats_row2):
        bx = MARGIN + i * (box_w + gap)
        draw_stat_box(c, bx, y - box_h, box_w, box_h, num, label)

    y -= box_h + 30

    # Bottom description - growth CTA
    desc = ("Whether you launched on Pump.fun last week or Clanker six months ago, "
            "ClaimScan has your back. Enter any handle or wallet address and see "
            "exactly what's waiting for you. No signups. No fees. Just your money.")
    y = wrap_text(c, desc, MARGIN, y, content_w, "Helvetica", 10, 14, GRAY)

    draw_page_number(c, 3)


def page_problem(c):
    """PAGE 4 - The Problem"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 02")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "THE CREATOR")
    c.drawString(MARGIN, y - 55, "FEE PROBLEM")

    draw_thick_rule(c, y - 75)

    y = y - 110

    # Problem description - pain-driven copy
    desc = ("You launched a token on Pump.fun. A few on Clanker. Maybe one on Believe. "
            "Each platform deposited creator fees into different wallets, using different "
            "mechanisms, on different chains. You forgot to claim some. You didn't even "
            "know about others. Right now, your money is sitting unclaimed across DeFi.")
    y = wrap_text(c, desc, MARGIN, y, content_w, "Helvetica", 11, 16, MID_GRAY)

    y -= 30

    # Pain point cards
    pain_points = [
        ("TOO MANY DASHBOARDS",
         "10 platforms. 10 different dashboards. 10 different login flows. "
         "No creator checks all of them. Most check zero. "
         "The friction kills your claim rate, and your revenue disappears."),

        ("TWO CHAINS, DOUBLE THE HASSLE",
         "Solana and Base speak different languages. Different wallets, explorers, RPCs, "
         "and token standards. If you launched on both chains, you need two completely "
         "separate workflows just to see what you're owed. Nobody has time for that."),

        ("SCATTERED IDENTITY",
         "Your @handle on Twitter, your Farcaster FID, your GitHub, your 0x wallet, your "
         "Solana address. All disconnected. Platforms only see fragments of you. "
         "No tool connects the dots. Until now."),
    ]

    for i, (title, desc_text) in enumerate(pain_points):
        # Card background
        card_h = 110
        c.setFillColor(NEAR_WHITE if i % 2 == 0 else white)
        c.setStrokeColor(OFF_WHITE)
        c.setLineWidth(1)
        c.rect(MARGIN, y - card_h, content_w, card_h, fill=1, stroke=1)

        # Black accent bar on left
        c.setFillColor(BLACK)
        c.rect(MARGIN, y - card_h, 4, card_h, fill=1, stroke=0)

        # Number
        c.setFont("Helvetica-Bold", 28)
        c.setFillColor(OFF_WHITE)
        c.drawRightString(PAGE_W - MARGIN - 12, y - 32, f"0{i+1}")

        # Title
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(BLACK)
        c.drawString(MARGIN + 18, y - 22, title)

        # Description
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY)
        text_y = y - 40
        words = desc_text.split()
        line = ""
        line_w = content_w - 80
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, "Helvetica", 9) <= line_w:
                line = test
            else:
                c.drawString(MARGIN + 18, text_y, line)
                text_y -= 12
                line = word
        if line:
            c.drawString(MARGIN + 18, text_y, line)

        y -= card_h + 12

    # Bottom callout
    y -= 10
    c.setFillColor(BLACK)
    c.rect(MARGIN, y - 40, content_w, 40, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W/2, y - 25, "RESULT: MILLIONS IN CREATOR FEES LEFT UNCLAIMED")

    draw_page_number(c, 4)


def page_solution(c):
    """PAGE 5 - The Solution"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 03")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "HOW CLAIMSCAN")
    c.drawString(MARGIN, y - 55, "SOLVES IT")

    draw_thick_rule(c, y - 75)

    y = y - 110

    solutions = [
        ("ONE SEARCH, ALL PLATFORMS",
         "Type your @handle. That's it. ClaimScan fires parallel queries across all 10 platforms "
         "and delivers your complete fee picture in under 30 seconds. No logins. No switching tabs."),

        ("TWO CHAINS, ONE DASHBOARD",
         "Solana and Base, unified. ClaimScan scans both ecosystems simultaneously and merges "
         "the results into a single view. Everything you're owed, in one place."),

        ("ALWAYS UP TO DATE",
         "Live polling every 30 seconds catches newly accumulated fees the moment they appear. "
         "Your dashboard is always current. Set it and forget it. We keep watching."),

        ("YOUR HANDLE FINDS YOUR WALLETS",
         "Enter a Twitter handle, and we find the wallets. Enter a Farcaster FID, and we "
         "map it to every chain. ClaimScan resolves your identity graph automatically."),

        ("SEE REAL DOLLAR AMOUNTS",
         "Raw token amounts mean nothing without context. ClaimScan converts everything to USD "
         "using live feeds from CoinGecko, DexScreener, and Jupiter. No more guessing."),

        ("ZERO COST, ZERO CATCH",
         "Free. Not freemium. Not \"free trial\". Free. We built ClaimScan for ourselves first. "
         "Now every creator in the ecosystem can use it. No token. No premium tier. Just value."),
    ]

    for i, (title, desc) in enumerate(solutions):
        # Alternating style
        if i % 2 == 0:
            # Black background item
            item_h = 70
            c.setFillColor(BLACK)
            c.rect(MARGIN, y - item_h, content_w, item_h, fill=1, stroke=0)

            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(MARGIN + 15, y - 20, title)

            c.setFont("Helvetica", 9)
            c.setFillColor(LIGHTER_GRAY)
            text_y = y - 36
        else:
            # White background item
            item_h = 70
            c.setStrokeColor(OFF_WHITE)
            c.setLineWidth(1)
            c.rect(MARGIN, y - item_h, content_w, item_h, fill=0, stroke=1)

            c.setFillColor(BLACK)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(MARGIN + 15, y - 20, title)

            c.setFont("Helvetica", 9)
            c.setFillColor(GRAY)
            text_y = y - 36

        # Wrap description text
        words = desc.split()
        line = ""
        line_w = content_w - 30
        color = LIGHTER_GRAY if i % 2 == 0 else GRAY
        c.setFillColor(color)
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, "Helvetica", 9) <= line_w:
                line = test
            else:
                c.drawString(MARGIN + 15, text_y, line)
                text_y -= 12
                line = word
        if line:
            c.drawString(MARGIN + 15, text_y, line)

        y -= item_h + 4

    draw_page_number(c, 5)


def page_how_it_works(c):
    """PAGE 6 - How It Works"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 04")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "HOW IT")
    c.drawString(MARGIN, y - 55, "WORKS")

    draw_thick_rule(c, y - 75)

    y = y - 100

    # Subtitle
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawString(MARGIN, y, "From @handle to full fee breakdown in under 30 seconds. Here's how.")

    y -= 40

    steps = [
        ("ENTER YOUR IDENTITY",
         "Type a Twitter handle, GitHub username, Farcaster handle, or wallet address. "
         "ClaimScan accepts multiple identity formats including direct URLs."),

        ("WE FIND YOUR WALLETS",
         "Social identities are resolved to wallet addresses using Neynar API, Twitter API, "
         "and on-chain data. Multiple wallets can be discovered from a single identity."),

        ("SCANNING 10 PLATFORMS",
         "Simultaneously queries 10 launchpad APIs and smart contracts across Solana and "
         "Base. Each platform adapter handles its own data format and claim mechanisms."),

        ("COLLECTING YOUR FEES",
         "Collects earned, claimed, and unclaimed fee data per token per platform. "
         "Data is normalized and deduplicated across all sources."),

        ("CONVERTING TO USD",
         "Live price feeds from CoinGecko, DexScreener, and Jupiter convert native token "
         "amounts to real dollar values. Prices cached with a 5-minute TTL for speed."),

        ("YOUR LIVE DASHBOARD",
         "Results displayed with live polling at 30-second intervals, platform breakdown, "
         "chain breakdown, token-level details, and claim status indicators."),
    ]

    for i, (title, desc) in enumerate(steps):
        # Step number circle
        draw_step_number(c, MARGIN + 16, y + 4, i + 1)

        # Vertical connector line (except last)
        if i < len(steps) - 1:
            c.setStrokeColor(LIGHTER_GRAY)
            c.setLineWidth(1)
            c.setDash(2, 2)
            c.line(MARGIN + 16, y - 10, MARGIN + 16, y - 65)
            c.setDash()

        # Title
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(BLACK)
        c.drawString(MARGIN + 42, y, title)

        # Description
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY)
        text_y = y - 16
        words = desc.split()
        line = ""
        line_w = content_w - 55
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, "Helvetica", 9) <= line_w:
                line = test
            else:
                c.drawString(MARGIN + 42, text_y, line)
                text_y -= 12
                line = word
        if line:
            c.drawString(MARGIN + 42, text_y, line)

        y -= 80

    # Bottom note
    y -= 10
    c.setFillColor(NEAR_WHITE)
    c.rect(MARGIN, y - 35, content_w, 35, fill=1, stroke=0)
    c.setStrokeColor(BLACK)
    c.setLineWidth(2)
    c.line(MARGIN, y - 35, MARGIN, y)

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(BLACK)
    c.drawString(MARGIN + 12, y - 15, "NOTE: ")
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawString(MARGIN + 52, y - 15, "All scanning is read-only. ClaimScan never requires wallet connections or signatures.")

    draw_page_number(c, 6)


def page_platforms(c):
    """PAGE 7 - Supported Platforms"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN
    half_w = (content_w - 20) / 2

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 05")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "SUPPORTED")
    c.drawString(MARGIN, y - 55, "PLATFORMS")

    draw_thick_rule(c, y - 75)

    y = y - 100

    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawString(MARGIN, y, "10 platforms across 2 blockchains. More coming in V2.")

    y -= 40

    # Left column - Solana
    left_x = MARGIN
    right_x = MARGIN + half_w + 20

    # Solana header
    c.setFillColor(BLACK)
    c.rect(left_x, y - 28, half_w, 28, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_x + 10, y - 20, "SOLANA")
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHTER_GRAY)
    c.drawRightString(left_x + half_w - 10, y - 20, "7 PLATFORMS")

    # Base header
    c.setFillColor(BLACK)
    c.rect(right_x, y - 28, half_w, 28, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(right_x + 10, y - 20, "BASE")
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHTER_GRAY)
    c.drawRightString(right_x + half_w - 10, y - 20, "3 PLATFORMS")

    y -= 45

    solana_platforms = [
        ("Pump.fun", "The largest Solana token launchpad", PUMP_COLOR),
        ("Bags.fm", "Social-first token launcher", BAGS_COLOR),
        ("Heaven", "Creator-focused launchpad", HEAVEN_COLOR),
        ("Believe", "Community-powered launches", BELIEVE_COLOR),
        ("RevShare", "Revenue-share for creators", REVSHARE_COLOR),
        ("Coinbarrel", "Fast token launches", COINBARREL_COLOR),
        ("Raydium", "Top Solana DEX", RAYDIUM_COLOR),
    ]

    base_platforms = [
        ("Clanker", "Base-native token launcher", CLANKER_COLOR),
        ("Zora", "Media & creator protocol", ZORA_COLOR),
        ("Bankr", "DeFi on Base", BANKR_COLOR),
    ]

    # Draw Solana platforms
    sy = y
    for name, desc, color in solana_platforms:
        # Color accent dot
        c.setFillColor(color)
        c.circle(left_x + 10, sy + 4, 4, fill=1, stroke=0)

        # Platform name
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(BLACK)
        c.drawString(left_x + 22, sy, name)

        # Description
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawString(left_x + 22, sy - 14, desc)

        # Separator
        c.setStrokeColor(OFF_WHITE)
        c.setLineWidth(0.3)
        c.line(left_x, sy - 22, left_x + half_w, sy - 22)

        sy -= 40

    # Draw Base platforms
    by = y
    for name, desc, color in base_platforms:
        # Color accent dot
        c.setFillColor(color)
        c.circle(right_x + 10, by + 4, 4, fill=1, stroke=0)

        # Platform name
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(BLACK)
        c.drawString(right_x + 22, by, name)

        # Description
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawString(right_x + 22, by - 14, desc)

        # Separator
        c.setStrokeColor(OFF_WHITE)
        c.setLineWidth(0.3)
        c.line(right_x, by - 22, right_x + half_w, by - 22)

        by -= 40

    # "Coming soon" box in Base column
    by -= 10
    c.setFillColor(NEAR_WHITE)
    c.rect(right_x, by - 35, half_w, 35, fill=1, stroke=0)
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawString(right_x + 10, by - 15, "+ More platforms coming in V2")
    c.drawString(right_x + 10, by - 28, "  Ethereum L1, Arbitrum, and more")

    # Bottom note
    bottom_y = 1.2 * inch
    c.setFillColor(BLACK)
    c.rect(MARGIN, bottom_y, content_w, 50, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(PAGE_W/2, bottom_y + 30, "MORE PLATFORMS ARE BEING ADDED CONTINUOUSLY")
    c.setFont("Helvetica", 9)
    c.setFillColor(LIGHTER_GRAY)
    c.drawCentredString(PAGE_W/2, bottom_y + 12, "ClaimScan V2 will expand to additional chains and launchpads.")

    draw_page_number(c, 7)


def page_architecture(c):
    """PAGE 8 - Architecture"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 06")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "ARCHITECTURE &")
    c.drawString(MARGIN, y - 55, "TECH STACK")

    draw_thick_rule(c, y - 75)

    y = y - 100

    # Tech stack table
    stack_items = [
        ("FRONTEND", "Next.js 16 + React 19 + Tailwind CSS v4"),
        ("BLOCKCHAIN", "@solana/web3.js + viem (EVM/Base)"),
        ("DATABASE", "Supabase (PostgreSQL)"),
        ("PRICE FEEDS", "CoinGecko, DexScreener, Jupiter API"),
        ("IDENTITY", "Neynar API (Farcaster), Twitter API"),
        ("MONITORING", "Sentry error tracking"),
        ("DEPLOYMENT", "Vercel Edge Network"),
        ("TYPOGRAPHY", "Exo 2 (headings) + JetBrains Mono"),
    ]

    row_h = 28
    for i, (category, tech) in enumerate(stack_items):
        item_y = y - i * row_h

        # Alternating background
        if i % 2 == 0:
            c.setFillColor(NEAR_WHITE)
            c.rect(MARGIN, item_y - 6, content_w, row_h, fill=1, stroke=0)

        # Category (left, bold, monospace-style)
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(BLACK)
        c.drawString(MARGIN + 10, item_y + 5, category)

        # Tech (right)
        c.setFont("Courier", 9)
        c.setFillColor(GRAY)
        c.drawString(MARGIN + 140, item_y + 5, tech)

    y -= len(stack_items) * row_h + 20

    # Database Schema
    draw_header_bar(c, "DATABASE SCHEMA", y, 25)
    y -= 38

    # Schema diagram (text-based)
    c.setFillColor(NEAR_WHITE)
    c.rect(MARGIN, y - 85, content_w, 85, fill=1, stroke=0)

    c.setFont("Courier-Bold", 10)
    c.setFillColor(BLACK)

    schema_y = y - 18
    c.drawCentredString(PAGE_W/2, schema_y, "creators  -->  wallets  -->  fee_records")
    schema_y -= 18
    c.setFont("Courier", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W/2, schema_y, "|              |              |")
    schema_y -= 14
    c.drawCentredString(PAGE_W/2, schema_y, "identity       blockchain     per-token fees")
    schema_y -= 14
    c.drawCentredString(PAGE_W/2, schema_y, "resolution     addresses      & USD values")

    y -= 105

    # Additional architecture notes
    draw_header_bar(c, "KEY ARCHITECTURE DECISIONS", y, 25)
    y -= 40

    arch_notes = [
        ("Smart deduplication", "Prevents duplicate API calls for concurrent requests"),
        ("30-second timeout", "All resolve operations timeout gracefully in serverless"),
        ("5-minute cache TTL", "Creator and fee data cached for optimal performance"),
        ("Visibility-aware polling", "Stops polling when browser tab is hidden"),
        ("Privacy-first logging", "SHA256 hashed search queries, no raw PII stored"),
    ]

    for title, desc in arch_notes:
        c.setFillColor(BLACK)
        c.circle(MARGIN + 5, y + 3, 2, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN + 15, y, title)

        tw = c.stringWidth(title, "Helvetica-Bold", 9)
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY)
        sep = "  --  "
        c.drawString(MARGIN + 15 + tw, y, sep + desc)

        y -= 18

    draw_page_number(c, 8)


def page_security(c):
    """PAGE 9 - Security & Privacy"""
    # Black page
    c.setFillColor(BLACK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Subtle dot grid
    draw_dot_grid(c, MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN,
                  spacing=30, radius=0.3, color=HexColor("#151515"))

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 07")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(white)
    c.drawString(MARGIN, y - 20, "SECURITY &")
    c.drawString(MARGIN, y - 55, "PRIVACY")

    # White rule
    c.setStrokeColor(GRAY)
    c.setLineWidth(2)
    c.line(MARGIN, y - 75, PAGE_W - MARGIN, y - 75)

    y = y - 100

    c.setFont("Helvetica-Oblique", 11)
    c.setFillColor(LIGHTER_GRAY)
    c.drawString(MARGIN, y, "No wallet connections. No data stored. No exceptions. By design.")

    y -= 45

    security_items = [
        ("PRIVACY-PRESERVING SEARCH",
         "All search queries are SHA256 hashed before logging. We never store raw search terms. "
         "Your identity lookups remain private."),

        ("SERVER-SIDE ISOLATION",
         "All sensitive operations run server-side only using Next.js server components. "
         "API keys and service role credentials are never exposed to the client bundle."),

        ("CONTENT PROTECTION",
         "Proprietary content and data displays are protected against unauthorized reproduction "
         "and scraping attempts."),

        ("NO WALLET CONNECTIONS",
         "ClaimScan is completely read-only. We never ask for wallet signatures, approvals, "
         "or any form of blockchain write access. Zero transaction risk."),

        ("ZERO DATA COLLECTION",
         "No personal data stored. No cookies. No tracking beyond anonymized, hashed analytics. "
         "Your privacy is not a feature. It's the default."),

        ("VERIFIABLE ON-CHAIN DATA",
         "Every fee record displayed can be independently verified on-chain. ClaimScan reads "
         "directly from smart contracts and public APIs. No black boxes."),
    ]

    for i, (title, desc) in enumerate(security_items):
        # White border card on dark bg
        card_h = 72
        c.setStrokeColor(MID_GRAY)
        c.setLineWidth(0.5)
        c.rect(MARGIN, y - card_h, content_w, card_h, fill=0, stroke=1)

        # White accent on left
        c.setFillColor(white)
        c.rect(MARGIN, y - card_h, 3, card_h, fill=1, stroke=0)

        # Title
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(white)
        c.drawString(MARGIN + 15, y - 18, title)

        # Description
        c.setFont("Helvetica", 9)
        c.setFillColor(LIGHT_GRAY)
        text_y = y - 34
        words = desc.split()
        line = ""
        line_w = content_w - 30
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, "Helvetica", 9) <= line_w:
                line = test
            else:
                c.drawString(MARGIN + 15, text_y, line)
                text_y -= 12
                line = word
        if line:
            c.drawString(MARGIN + 15, text_y, line)

        y -= card_h + 8

    draw_page_number(c, 9, color=GRAY)


def page_roadmap(c):
    """PAGE 10 - Roadmap"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 08")

    # Title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "WHAT'S")
    c.drawString(MARGIN, y - 55, "NEXT")

    draw_thick_rule(c, y - 75)

    y = y - 105

    # V1 - Current
    c.setFillColor(BLACK)
    c.rect(MARGIN, y - 165, content_w, 165, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN + 15, y - 25, "V1")
    c.setFont("Helvetica", 10)
    c.setFillColor(LIGHTER_GRAY)
    c.drawString(MARGIN + 45, y - 23, "CURRENT  |  MARCH 2026")

    v1_items = [
        "10 platform support (Solana + Base)",
        "Multi-identity search (Twitter, GitHub, Farcaster, Wallet)",
        "Real-time fee polling with 30s intervals",
        "USD conversion with live price feeds",
        "Mobile-responsive brutalist design",
        "Privacy-preserving search analytics",
    ]

    item_y = y - 50
    for item in v1_items:
        c.setFillColor(PUMP_COLOR)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN + 15, item_y, ">")
        c.setFillColor(white)
        c.setFont("Helvetica", 9)
        c.drawString(MARGIN + 30, item_y, item)
        item_y -= 18

    y -= 185

    # V2 - Coming Soon
    c.setStrokeColor(BLACK)
    c.setLineWidth(1.5)
    c.rect(MARGIN, y - 155, content_w, 155, fill=0, stroke=1)

    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN + 15, y - 25, "V2")
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawString(MARGIN + 45, y - 23, "COMING SOON")

    v2_items = [
        "Additional chain support (Ethereum L1, Arbitrum, etc.)",
        "More launchpad integrations",
        "Historical fee tracking & analytics",
        "Email/Telegram notifications for new unclaimed fees",
        "Portfolio dashboard for multi-creator agencies",
        "API access for third-party integrations",
    ]

    item_y = y - 50
    for item in v2_items:
        c.setFillColor(GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(MARGIN + 15, item_y, "->")
        c.setFillColor(BLACK)
        c.drawString(MARGIN + 35, item_y, item)
        item_y -= 16

    y -= 175

    # V3 - Future
    c.setFillColor(NEAR_WHITE)
    c.rect(MARGIN, y - 110, content_w, 110, fill=1, stroke=0)

    c.setFillColor(LIGHT_GRAY)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN + 15, y - 25, "V3")
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN + 45, y - 23, "FUTURE")

    v3_items = [
        "One-click claim across all platforms",
        "Automated claim scheduling",
        "Creator analytics & insights dashboard",
        "SDK for platform integrations",
    ]

    item_y = y - 50
    for item in v3_items:
        c.setFillColor(LIGHTER_GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(MARGIN + 15, item_y, "->")
        c.setFillColor(GRAY)
        c.drawString(MARGIN + 35, item_y, item)
        item_y -= 16

    y -= 125

    # Bottom callout
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(BLACK)
    c.drawCentredString(PAGE_W/2, y, "This is V1. We ship fast.")
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W/2, y - 18, "Follow @lwartss for V2 announcements.")

    draw_page_number(c, 10)


def page_team(c):
    """PAGE 11 - About LW Team"""
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    y = PAGE_H - 1.0*inch
    content_w = PAGE_W - 2 * MARGIN

    # Section number
    c.setFont("Helvetica", 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawString(MARGIN, y + 15, "SECTION 09")

    # Title with LW logo
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(BLACK)
    c.drawString(MARGIN, y - 20, "BUILT BY")
    c.drawString(MARGIN, y - 55, "LW TEAM")

    # LW flame logo next to title (dark circle backing on white bg)
    draw_lw_logo_on_light(c, PAGE_W - MARGIN - 35, y - 35, size=65)

    draw_thick_rule(c, y - 75)

    y = y - 110

    # Description - strong positioning
    desc = ("LW is not an agency. We're a 4-person Web3 development studio that ships "
            "real products. No layers. No outsourcing. Every project is built by the "
            "same people you talk to on Telegram.")
    y = wrap_text(c, desc, MARGIN, y, content_w, "Helvetica", 11, 16, MID_GRAY)

    y -= 15

    # Quote
    c.setFillColor(NEAR_WHITE)
    c.rect(MARGIN, y - 40, content_w, 45, fill=1, stroke=0)
    c.setStrokeColor(BLACK)
    c.setLineWidth(3)
    c.line(MARGIN, y - 40, MARGIN, y + 5)
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(MID_GRAY)
    c.drawString(MARGIN + 15, y - 10, "We've been deep in crypto since 2021. We survived rug pulls, bear markets,")
    c.drawString(MARGIN + 15, y - 24, "and hype cycles. We don't just build. We understand the market.")

    y -= 65

    # Stats
    box_w = (content_w - 10) / 2
    box_h = 60

    draw_inverted_stat_box(c, MARGIN, y - box_h, box_w, box_h, "408+", "PROJECTS DELIVERED")
    draw_inverted_stat_box(c, MARGIN + box_w + 10, y - box_h, box_w, box_h, "$1.6B+", "MARKET CAP GENERATED")

    y -= box_h + 25

    # Team members
    draw_header_bar(c, "THE TEAM", y, 25)
    y -= 45

    members = [
        ("LW-2201", "BRANDING SPECIALIST", "Brand psychology, logos, visual identity"),
        ("LW-2202", "FRONTEND DEVELOPER", "Websites, dApps, bots, dashboards"),
        ("LW-2203", "BACKEND ENGINEER", "APIs, databases, contract integrations"),
        ("LW-2204", "MOTION DESIGNER", "Promo videos, animated logos, TGS stickers"),
    ]

    member_w = (content_w - 10) / 2
    member_h = 65

    for i, (id_code, role, desc) in enumerate(members):
        col = i % 2
        row = i // 2
        mx = MARGIN + col * (member_w + 10)
        my = y - row * (member_h + 8)

        # Card
        c.setStrokeColor(OFF_WHITE)
        c.setLineWidth(1)
        c.rect(mx, my - member_h, member_w, member_h, fill=0, stroke=1)

        # ID badge
        c.setFillColor(BLACK)
        c.rect(mx + 8, my - 22, 55, 16, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Courier-Bold", 7)
        c.drawString(mx + 12, my - 18, id_code)

        # Role
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(BLACK)
        c.drawString(mx + 70, my - 18, role)

        # Description
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawString(mx + 10, my - 42, desc)

    y -= 2 * (member_h + 8) + 15

    # ClaimScan note
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(BLACK)
    note = "ClaimScan started as our own tool. We needed it. Nobody built it. So we did."
    c.drawString(MARGIN, y, note)

    y -= 30

    # Contact info
    draw_thick_rule(c, y)
    y -= 25

    contacts = [
        ("X / TWITTER", "@lwartss"),
        ("TELEGRAM", "t.me/lwarts"),
        ("WEBSITE", "lwdesigns.art"),
    ]

    for i, (label, value) in enumerate(contacts):
        cx = MARGIN + i * (content_w / 3)
        c.setFont("Helvetica", 7)
        c.setFillColor(LIGHT_GRAY)
        c.drawString(cx, y, label)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(BLACK)
        c.drawString(cx, y - 16, value)

    draw_page_number(c, 11)


def page_back_cover(c):
    """PAGE 12 - Back Cover"""
    # Full black background
    c.setFillColor(BLACK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Subtle dot grid
    draw_dot_grid(c, MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN,
                  spacing=30, radius=0.3, color=HexColor("#141414"))

    # Center content
    cy = PAGE_H / 2 + 0.8*inch

    # Official ClaimScan logo (large, centered)
    logo_size = 100
    draw_claimscan_logo(c, PAGE_W/2, cy, size=logo_size)

    # Title
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(PAGE_W/2, cy - logo_size/2 - 35, "CLAIMSCAN")

    # URL
    c.setFont("Helvetica", 14)
    c.setFillColor(LIGHTER_GRAY)
    c.drawCentredString(PAGE_W/2, cy - logo_size/2 - 65, "claimscan.tech")

    # Separator
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.5)
    sep_y = cy - logo_size/2 - 95
    c.line(PAGE_W/2 - 1.5*inch, sep_y, PAGE_W/2 + 1.5*inch, sep_y)

    # Tagline
    c.setFont("Helvetica-Oblique", 12)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W/2, sep_y - 30, "Your money is out there. We find it.")

    # CTA - Activation Energy: make the next step trivially easy
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W/2, sep_y - 65, "SCAN YOUR FEES NOW")
    c.setFont("Helvetica", 9)
    c.setFillColor(LIGHTER_GRAY)
    c.drawCentredString(PAGE_W/2, sep_y - 82, "Visit claimscan.tech  |  Enter your @handle  |  See what you're owed")

    # LW attribution with official logo
    bottom_y = 1.5*inch
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(PAGE_W/2, bottom_y + 50, "A PRODUCT BY")

    # LW flame logo
    draw_lw_logo(c, PAGE_W/2, bottom_y + 20, size=40)

    # Version and copyright
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.3)
    c.line(MARGIN, bottom_y - 10, PAGE_W - MARGIN, bottom_y - 10)

    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawString(MARGIN, bottom_y - 30, "V1.0  |  MARCH 2026")
    c.drawRightString(PAGE_W - MARGIN, bottom_y - 30, "2026 LW ARTS. All rights reserved.")


# ============================================================
# MAIN - Generate PDF
# ============================================================

def main():
    c = canvas.Canvas(OUTPUT_PATH, pagesize=letter)
    c.setTitle("ClaimScan Whitepaper V1.0")
    c.setAuthor("LW TEAM")
    c.setSubject("Cross-Chain DeFi Fee Tracker")
    c.setCreator("ClaimScan")

    # Page 1 - Cover
    page_cover(c)
    c.showPage()

    # Page 2 - TOC
    page_toc(c)
    c.showPage()

    # Page 3 - Introduction
    page_introduction(c)
    c.showPage()

    # Page 4 - The Problem
    page_problem(c)
    c.showPage()

    # Page 5 - The Solution
    page_solution(c)
    c.showPage()

    # Page 6 - How It Works
    page_how_it_works(c)
    c.showPage()

    # Page 7 - Supported Platforms
    page_platforms(c)
    c.showPage()

    # Page 8 - Architecture
    page_architecture(c)
    c.showPage()

    # Page 9 - Security & Privacy
    page_security(c)
    c.showPage()

    # Page 10 - Roadmap
    page_roadmap(c)
    c.showPage()

    # Page 11 - Team
    page_team(c)
    c.showPage()

    # Page 12 - Back Cover
    page_back_cover(c)
    c.showPage()

    c.save()
    print(f"Whitepaper generated: {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")
    print(f"Pages: 12")


if __name__ == "__main__":
    main()
    # Clean up temp logo files
    for tmp in [LW_LOGO_BLACK, CLAIMSCAN_LOGO_TRANSPARENT, CLAIMSCAN_LOGO_BLACK]:
        try:
            os.unlink(tmp)
        except OSError:
            pass
