import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";

/**
 * Initialize OpenTelemetry tracing for the frontend application
 * Sends traces to Jaeger via OTLP HTTP endpoint
 */
export function initializeOpenTelemetry() {
  try {
    // Create the OTLP exporter targeting Jaeger's OTLP endpoint
    const exporter = new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces", // Jaeger OTLP endpoint
      headers: {},
    });

    // Create batch span processor
    const spanProcessor = new BatchSpanProcessor(exporter, {
      maxQueueSize: 100,
      maxExportBatchSize: 10,
      scheduledDelayMillis: 500,
    });

    // Create a tracer provider with service identification and span processor
    const provider = new WebTracerProvider({
      resource: {
        attributes: {
          "service.name": "cuet-hackathon-frontend",
          "service.version": "1.0.0",
        },
      } as any,
      spanProcessors: [spanProcessor], // Pass span processor in constructor config
    });

    // Register the provider
    provider.register({
      contextManager: new ZoneContextManager(),
    });

    // Register automatic instrumentations for fetch API
    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: [
            /http:\/\/localhost:3000.*/, // Backend API
            /http:\/\/localhost:4318.*/, // Jaeger OTLP
          ],
          clearTimingResources: true,
          applyCustomAttributesOnSpan: (span, request, result) => {
            // Add custom attributes to fetch spans
            if (request instanceof Request) {
              span.setAttribute("http.url", request.url);
              span.setAttribute("http.method", request.method);
            }
            if (result instanceof Response) {
              span.setAttribute("http.status_code", result.status);
            }
          },
        }),
      ],
    });

    console.log(
      "✓ OpenTelemetry initialized - traces will be sent to Jaeger at http://localhost:16686",
    );
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenTelemetry:", error);
    return false;
  }
}

/**
 * Get the global tracer for manual instrumentation
 */
export function getTracer() {
  try {
    const { trace } = require("@opentelemetry/api");
    return trace.getTracer("cuet-hackathon-frontend", "1.0.0");
  } catch (error) {
    console.error("Failed to get tracer:", error);
    return null;
  }
}
