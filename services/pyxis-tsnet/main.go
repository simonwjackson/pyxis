// pyxis-tsnet joins the tailnet as "pyxis" and reverse-proxies HTTPS to the
// localhost-only Rust service. Nothing is funneled to the public internet.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"tailscale.com/tsnet"
)

func main() {
	name := flag.String("name", "pyxis", "tailnet hostname for this node")
	upstream := flag.String("upstream", "http://127.0.0.1:4488", "Pyxis server to proxy")
	state := flag.String("state", defaultState(), "tsnet state directory")
	flag.Parse()

	if err := os.MkdirAll(*state, 0o700); err != nil {
		log.Fatal(err)
	}
	server := &tsnet.Server{Hostname: *name, Dir: *state}
	defer server.Close()

	// First authorization can wait for a human click. Restarting sooner would mint a new
	// URL and invalidate the one the operator is looking at.
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Hour)
	defer cancel()
	status, err := server.Up(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fqdn := strings.TrimSuffix(status.Self.DNSName, ".")
	log.Printf("pyxis-tsnet: %s -> %s", fqdn, *upstream)

	target, err := url.Parse(*upstream)
	if err != nil {
		log.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)

	go func() {
		listener, err := server.Listen("tcp", ":80")
		if err != nil {
			log.Printf("pyxis-tsnet: HTTP listener: %v", err)
			return
		}
		_ = http.Serve(listener, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			http.Redirect(
				writer,
				request,
				"https://"+fqdn+request.URL.RequestURI(),
				http.StatusTemporaryRedirect,
			)
		}))
	}()

	listener, err := server.ListenTLS("tcp", ":443")
	if err != nil {
		log.Fatal(err)
	}
	log.Fatal(http.Serve(listener, proxy))
}

func defaultState() string {
	if directory, err := os.UserConfigDir(); err == nil {
		return filepath.Join(directory, "pyxis-tsnet")
	}
	return "./pyxis-tsnet-state"
}
