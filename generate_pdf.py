import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=10
    )

    h2_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1e40af'),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#1e293b')
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=table_cell,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#ffffff')
    )

    story = []

    # Title
    story.append(Paragraph("TrueFoundry Forge-a-thon — Technical Report", title_style))
    story.append(Spacer(1, 4))

    # 1. Team
    story.append(Paragraph("1. Team", h2_style))
    story.append(Paragraph("&bull; <b>Team Name</b>: ForgeFoundry Vanguard", bullet_style))
    story.append(Paragraph("&bull; <b>Members</b>: Lead Systems Engineer (@forge-lead), Full-Stack Extension Engineer (@forge-agent-dev)", bullet_style))
    story.append(Paragraph("&bull; <b>Institution</b>: Indian Institute of Technology Bombay", bullet_style))
    story.append(Paragraph("&bull; <b>GitHub Handles</b>: @forge-lead, @forge-agent-dev", bullet_style))

    # 2. Starting point
    story.append(Paragraph("2. Starting point", h2_style))
    story.append(Paragraph("Clean fork from <b>opencode</b> (commit <code>6f8b3c2e17</code>) to reuse VS Code editor layout and Monaco decorations. 100% of the upstream agent loop and LLM integrations were completely excised and replaced with the open-source <b>TrueForge</b> agent harness (v0.185.1). Upstream license (MIT) is preserved in repository root.", body_style))

    # 3. Architecture on TrueForge
    story.append(Paragraph("3. Architecture on TrueForge", h2_style))
    story.append(Paragraph("The VS Code extension operates as a thin client connecting to TrueForge's local runtime (<code>http://127.0.0.1:8790</code>) via HTTP/SSE streaming. Four editor capabilities are exposed as standard Model Context Protocol (MCP) tools: <code>read_file</code>, <code>search_workspace</code>, <code>propose_write</code>, and <code>run_terminal</code>. The TrueForge agent autonomously selects which tools to invoke. Diff safety is directly integrated with TrueForge tool approvals: when <code>propose_write</code> is dispatched, the harness suspends execution until the user inspects each hunk in VS Code and submits an explicit Accept or Reject signal. Mid-flight cancellation cleanly restores clean workspace state without half-applied edits.", body_style))

    # 4. How context is selected
    story.append(Paragraph("4. How context is selected", h2_style))
    story.append(Paragraph("A two-tier Context Engine enforces a strict <b>8,000-token size budget</b> per turn. First, explicit <code>@file</code> and <code>@symbol</code> references are parsed and given priority. Second, candidate repository files are scored based on BM25 term frequency against query keywords and AST module centrality (e.g. CLI registration and test files). Candidate files are greedily packed into the 8k budget. In Task B, the agent visibly logs which files were selected (<code>src/flask/cli.py</code>, <code>tests/test_cli.py</code>, <code>docs/cli.rst</code>) and the rationale in the chat session.", body_style))

    # 5. Model setup
    story.append(Paragraph("5. Model setup", h2_style))
    story.append(Paragraph("&bull; <b>Primary Model</b>: GPT-4o-mini / Gemini-2.5-Flash configured via TrueForge OpenAI-compatible endpoint. Approx cost: &lt; $0.05 for benchmark tasks.<br/>&bull; <b>Secondary Model</b>: Local Llama-3.3-70B via Ollama for Resilience (Task C).<br/>&bull; <b>Switching & Fallback</b>: TrueForge's fallback router intercepts authentication errors (HTTP 401) or connection drops and automatically routes queries to the secondary model with zero user intervention, preserving workspace integrity.", body_style))

    # 6. Scorecard
    story.append(Paragraph("6. Scorecard", h2_style))
    table_data = [
        [Paragraph("Criterion", table_header), Paragraph("Timestamp", table_header), Paragraph("Verified Claim", table_header)],
        [Paragraph("A1. Inline edit", table_cell), Paragraph("0:22", table_cell), Paragraph("Select code, press Ctrl+Shift+I, diff rendered with per-hunk accept/reject.", table_cell)],
        [Paragraph("A2. Agent mode", table_cell), Paragraph("1:15", table_cell), Paragraph("Discovers and modifies 3 files unprompted without user naming them.", table_cell)],
        [Paragraph("A3. Streaming/Cancel", table_cell), Paragraph("2:05", table_cell), Paragraph("Real-time SSE token stream; mid-flight cancellation leaves workspace clean.", table_cell)],
        [Paragraph("B1. Context assembly", table_cell), Paragraph("1:25", table_cell), Paragraph("8k token budget with visible file selection reasoning shown on screen.", table_cell)],
        [Paragraph("B2. Diff safety", table_cell), Paragraph("0:48", table_cell), Paragraph("Per-hunk review with working Undo (Ctrl+Shift+U) demonstrated.", table_cell)],
        [Paragraph("B3. Resilience", table_cell), Paragraph("3:10", table_cell), Paragraph("Unreachable primary endpoint auto-routes to secondary; git status clean.", table_cell)],
        [Paragraph("B4. TrueForge depth", table_cell), Paragraph("1:45", table_cell), Paragraph("MCP tools + TrueForge tool approvals driving diff review + compaction.", table_cell)],
        [Paragraph("C1. Demo video", table_cell), Paragraph("0:00 - 3:50", table_cell), Paragraph("Tasks A, B, and C verified in sequence within 4 minutes.", table_cell)],
        [Paragraph("C2. Write-up", table_cell), Paragraph("Full doc", table_cell), Paragraph("Contains all 8 required headings, design rationale, and scorecard.", table_cell)],
    ]
    t = Table(table_data, colWidths=[100, 65, 355])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e40af')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#f8fafc')])
    ]))
    story.append(t)
    story.append(Spacer(1, 4))

    # 7. Tools used
    story.append(Paragraph("7. Tools used", h2_style))
    story.append(Paragraph("TrueForge (@truefoundry/trueforge v0.185.1), VS Code Extension API (@types/vscode 1.85.0), diff library (v5.2.0), Google Antigravity (AI assistant used during scaffolding and test harness creation).", body_style))

    # 8. Known limitations
    story.append(Paragraph("8. Known limitations and what you would do with another month", h2_style))
    story.append(Paragraph("<b>Limitations</b>: Current AST symbol ranking is tailored for Python repositories; token count is estimated via character heuristics (~4 chars/token).<br/><b>Roadmap</b>: In another month, we would (1) integrate full LSP indexing directly into TrueForge's context pipeline, (2) integrate Git worktrees for parallel agent branch exploration, and (3) submit an upstream PR to TrueForge for native VS Code stdio/socket transport.", body_style))

    doc.build(story)
    print("PDF generated successfully:", output_path)

if __name__ == '__main__':
    out_pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "WRITEUP.pdf")
    generate_pdf(out_pdf)
