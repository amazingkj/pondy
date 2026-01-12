// Mock server that simulates Spring Boot Actuator metrics endpoints
// Usage: go run ./cmd/mock -port 9090
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"
)

var (
	port           = flag.Int("port", 9090, "Port to listen on")
	maxConnections = flag.Int("max", 20, "Maximum pool connections")
)

// Simulated metrics state
type metricsState struct {
	active  int
	idle    int
	pending int
}

var state = &metricsState{
	active:  5,
	idle:    15,
	pending: 0,
}

func main() {
	flag.Parse()

	// Simulate changing metrics
	go func() {
		for {
			time.Sleep(2 * time.Second)
			simulateActivity()
		}
	}()

	http.HandleFunc("/actuator/metrics", metricsHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.active", activeHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.idle", idleHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.pending", pendingHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.max", maxHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.timeout", timeoutHandler)
	http.HandleFunc("/actuator/metrics/hikaricp.connections.acquire", acquireHandler)
	http.HandleFunc("/actuator/metrics/jvm.memory.used", memoryUsedHandler)
	http.HandleFunc("/actuator/metrics/jvm.memory.max", memoryMaxHandler)
	http.HandleFunc("/actuator/metrics/jvm.threads.live", threadsHandler)
	http.HandleFunc("/actuator/metrics/process.cpu.usage", cpuHandler)
	http.HandleFunc("/actuator/metrics/jvm.gc.pause", gcPauseHandler)
	http.HandleFunc("/actuator/health", healthHandler)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Mock Actuator server starting on %s", addr)
	log.Printf("Configure pondy with endpoint: http://localhost%s/actuator/metrics", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func simulateActivity() {
	// Random changes to simulate real activity
	change := rand.Intn(5) - 2 // -2 to +2

	state.active += change
	if state.active < 0 {
		state.active = 0
	}
	if state.active > *maxConnections {
		state.active = *maxConnections
	}

	state.idle = *maxConnections - state.active
	if state.idle < 0 {
		state.idle = 0
	}

	// Occasionally add pending requests
	if rand.Intn(10) == 0 {
		state.pending = rand.Intn(3)
	} else if state.pending > 0 {
		state.pending--
	}
}

func metricsHandler(w http.ResponseWriter, r *http.Request) {
	metrics := map[string]interface{}{
		"names": []string{
			"hikaricp.connections.active",
			"hikaricp.connections.idle",
			"hikaricp.connections.pending",
			"hikaricp.connections.max",
			"hikaricp.connections.timeout",
			"hikaricp.connections.acquire",
			"jvm.memory.used",
			"jvm.memory.max",
			"jvm.threads.live",
			"process.cpu.usage",
			"jvm.gc.pause",
		},
	}
	json.NewEncoder(w).Encode(metrics)
}

func activeHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "hikaricp.connections.active", float64(state.active), "VALUE")
}

func idleHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "hikaricp.connections.idle", float64(state.idle), "VALUE")
}

func pendingHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "hikaricp.connections.pending", float64(state.pending), "VALUE")
}

func maxHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "hikaricp.connections.max", float64(*maxConnections), "VALUE")
}

func timeoutHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "hikaricp.connections.timeout", 0, "COUNT")
}

func acquireHandler(w http.ResponseWriter, r *http.Request) {
	// Return p99 latency in seconds
	response := map[string]interface{}{
		"name": "hikaricp.connections.acquire",
		"measurements": []map[string]interface{}{
			{"statistic": "VALUE", "value": rand.Float64() * 0.01}, // 0-10ms
		},
		"availableTags": []map[string]interface{}{
			{"tag": "quantile", "values": []string{"0.99"}},
		},
	}
	json.NewEncoder(w).Encode(response)
}

func memoryUsedHandler(w http.ResponseWriter, r *http.Request) {
	area := r.URL.Query().Get("tag")
	if area == "area:heap" {
		writeMetric(w, "jvm.memory.used", float64(300*1024*1024+rand.Intn(100*1024*1024)), "VALUE") // 300-400MB
	} else if area == "area:nonheap" {
		writeMetric(w, "jvm.memory.used", float64(80*1024*1024+rand.Intn(20*1024*1024)), "VALUE") // 80-100MB
	} else {
		writeMetric(w, "jvm.memory.used", float64(400*1024*1024), "VALUE")
	}
}

func memoryMaxHandler(w http.ResponseWriter, r *http.Request) {
	area := r.URL.Query().Get("tag")
	if area == "area:heap" {
		writeMetric(w, "jvm.memory.max", float64(512*1024*1024), "VALUE") // 512MB
	} else {
		writeMetric(w, "jvm.memory.max", float64(512*1024*1024), "VALUE")
	}
}

func threadsHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "jvm.threads.live", float64(50+rand.Intn(20)), "VALUE")
}

func cpuHandler(w http.ResponseWriter, r *http.Request) {
	writeMetric(w, "process.cpu.usage", 0.1+rand.Float64()*0.3, "VALUE") // 10-40%
}

func gcPauseHandler(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"name": "jvm.gc.pause",
		"measurements": []map[string]interface{}{
			{"statistic": "COUNT", "value": float64(100 + rand.Intn(50))},
			{"statistic": "TOTAL_TIME", "value": 0.5 + rand.Float64()*0.5},
		},
		"availableTags": []map[string]interface{}{
			{"tag": "action", "values": []string{"end of minor GC", "end of major GC"}},
		},
	}
	json.NewEncoder(w).Encode(response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status": "UP",
	}
	json.NewEncoder(w).Encode(response)
}

func writeMetric(w http.ResponseWriter, name string, value float64, statistic string) {
	response := map[string]interface{}{
		"name": name,
		"measurements": []map[string]interface{}{
			{"statistic": statistic, "value": value},
		},
	}
	json.NewEncoder(w).Encode(response)
}
