from langgraph.graph import StateGraph, END
from .state import RAGState, IngestionState
from .nodes import retrieve_node, generate_node, synthesize_node, insights_node

# Query Graph
query_builder = StateGraph(RAGState)
query_builder.add_node("retrieve", retrieve_node)
query_builder.add_node("generate", generate_node)
query_builder.add_node("synthesize", synthesize_node)

query_builder.set_entry_point("retrieve")
query_builder.add_edge("retrieve", "generate")
query_builder.add_edge("generate", "synthesize")
query_builder.add_edge("synthesize", END)

query_graph = query_builder.compile()

# Ingestion Graph
ingestion_builder = StateGraph(IngestionState)
ingestion_builder.add_node("insights", insights_node)

ingestion_builder.set_entry_point("insights")
ingestion_builder.add_edge("insights", END)

ingestion_graph = ingestion_builder.compile()
