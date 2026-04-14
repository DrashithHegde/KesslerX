#!/usr/bin/env python3
"""
Diagnostic script for KesslerX RAG (Retrieval-Augmented Generation) engine.
Tests Gemini integration and provides detailed troubleshooting information.
"""

import asyncio
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Load environment
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

async def main():
    print_section("RAG Engine Diagnostic Report")
    
    # 1. Check environment
    print("1. ENVIRONMENT CHECK")
    print("-" * 60)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("❌ ERROR: GEMINI_API_KEY not set in .env")
        return
    
    api_key_masked = f"{api_key[:10]}...{api_key[-5:]}" if len(api_key) > 20 else "***"
    print(f"✓ GEMINI_API_KEY found: {api_key_masked}")
    print(f"✓ API Key length: {len(api_key)} characters")
    
    # 2. Check dependencies
    print("\n2. DEPENDENCY CHECK")
    print("-" * 60)
    try:
        import langchain_core
        print("✓ langchain_core installed")
    except ImportError as e:
        print(f"❌ Missing: langchain_core - {e}")
        return
    
    try:
        import langchain_google_genai
        print("✓ langchain_google_genai installed")
    except ImportError as e:
        print(f"❌ Missing: langchain_google_genai - {e}")
        return
    
    try:
        from app.core.config import get_settings
        settings = get_settings()
        print(f"✓ Settings loaded: cache_backend={settings.cache_backend}")
    except Exception as e:
        print(f"❌ Failed to load settings: {e}")
        return
    
    # 3. Import RAG engine
    print("\n3. RAG ENGINE INITIALIZATION")
    print("-" * 60)
    try:
        from app.core.rag import rag_engine, GEMINI_MODELS, KESSLER_SYSTEM_PROMPT
        print(f"✓ RAG engine imported successfully")
        print(f"  - Available models: {', '.join(GEMINI_MODELS)}")
        print(f"  - Engine enabled: {rag_engine.enabled}")
        print(f"  - Model in use: {rag_engine.model_used or 'N/A'}")
        print(f"  - LLM initialized: {rag_engine.llm is not None}")
        
        if not rag_engine.enabled:
            print("\n⚠️  WARNING: RAG engine is disabled. Checking why...")
            if not settings.gemini_api_key:
                print("  Reason: No GEMINI_API_KEY configured")
            else:
                print("  Reason: Failed to initialize any Gemini model")
                print("  → Check logs above for model initialization errors")
    except Exception as e:
        print(f"❌ Failed to import RAG engine: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # 4. Test LLM connectivity (if enabled)
    if rag_engine.enabled and rag_engine.llm:
        print("\n4. LLM CONNECTIVITY TEST")
        print("-" * 60)
        try:
            from langchain_core.messages import SystemMessage, HumanMessage
            
            print("Sending test prompt to Gemini...")
            messages = [
                SystemMessage(content="You are a helpful assistant. Respond with exactly one sentence."),
                HumanMessage(content="Test connection. Reply with: 'RAG connection successful.'")
            ]
            
            response = await rag_engine.llm.ainvoke(messages)
            response_text = response.content if hasattr(response, "content") else str(response)
            
            print(f"✓ LLM responded successfully")
            print(f"  Response: {str(response_text)[:100]}...")
            
        except asyncio.TimeoutError:
            print("❌ TIMEOUT: LLM call timed out (30s+)")
            print("   → Check network connectivity")
            print("   → Check Gemini API quota/status")
        except Exception as e:
            print(f"❌ LLM call failed: {type(e).__name__}: {str(e)[:100]}")
            import traceback
            traceback.print_exc()
    
    # 5. Test RAG explanation generation
    if rag_engine.enabled and rag_engine.llm:
        print("\n5. RAG EXPLANATION GENERATION TEST")
        print("-" * 60)
        try:
            test_context = {
                "norad_id": "12110",
                "object_name": "COSMOS 1231",
                "uncertainty_score": 85,
                "risk_score": 72,
                "risk_band": "HIGH",
                "event_class": "super_close_call",
                "min_separation_km": 15.5,
                "tca_minutes": 45,
                "is_confirmed_collision": False,
                "regime": "LEO",
                "debris_share": 35.0,
                "density_band": "MODERATE",
                "tracked_debris": 150,
                "objects_in_orbital_band": 8500,
                "is_debris_outlier": True,
                "density_score": 65,
                "anomaly_score": 72,
                "zone_crossing_detected": True,
                "zone_crossing_cells": 2,
                "zone_risk_penalty": 1.3,
                "event_label": "conjunction"
            }
            
            print("Generating explanation for test scenario...")
            explanation = await rag_engine.generate_explanation(test_context)
            
            print("✓ Explanation generated successfully\n")
            print("Generated Brief:")
            print("-" * 60)
            print(explanation)
            print("-" * 60)
            
        except Exception as e:
            print(f"❌ Explanation generation failed: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
    
    # 6. Cache status
    print("\n6. CACHE STATUS")
    print("-" * 60)
    if rag_engine.enabled:
        cache_size = len(rag_engine._explain_cache)
        print(f"✓ Cache entries: {cache_size}/{rag_engine.max_cache_entries}")
        print(f"✓ TTL: {rag_engine.cache_ttl_seconds}s (errors: {rag_engine.error_cache_ttl_seconds}s)")
    else:
        print("Cache not available (engine disabled)")
    
    print_section("Diagnostic Complete")
    print("Next steps:")
    print("  1. Review any error messages above")
    print("  2. Verify GEMINI_API_KEY is valid and has quota")
    print("  3. Check network connectivity to api.generativeai.google.com")
    print("  4. For persistent issues, check server logs: --loglevel debug")
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code or 0)
