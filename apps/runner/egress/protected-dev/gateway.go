// ZoeLearning Phase 2C3: supervised-development egress gateway.
// A protocol-enforcing process is NOT an independent network firewall.
// Do not deploy this image as the production egress security boundary.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	listenAddr                 = ":3128"
	maxTunnelSeconds           = 30
	maxDirectionBytes    int64 = 32 << 20
	maxHTTPResponseBytes int64 = 64 << 20
	maxConcurrent              = 8
)

var allowedHTTP = map[string]bool{"archive.ubuntu.com": true, "security.ubuntu.com": true}
var allowedCONNECT = map[string]bool{"example.com": true}

var denyPrefixes = parsePrefixes([]string{
	"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
	"169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
	"192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
	"203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
	"::/128", "::1/128", "::ffff:0:0/96", "64:ff9b:1::/48",
	"100::/64", "2001::/23", "2001:db8::/32", "2001:10::/28", "2002::/16",
	"fc00::/7", "fe80::/10", "ff00::/8",
})

func parsePrefixes(values []string) []netip.Prefix {
	out := make([]netip.Prefix, 0, len(values))
	for _, s := range values {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}

func publicIP(addr netip.Addr) bool {
	if !addr.IsValid() || !addr.IsGlobalUnicast() || addr.Is4In6() {
		return false
	}
	for _, prefix := range denyPrefixes {
		if prefix.Contains(addr) {
			return false
		}
	}
	// Development gate currently supports IPv4 egress only. Do not fall back to IPv6.
	return addr.Is4()
}

func validHost(h string) bool {
	if len(h) < 1 || len(h) > 253 || h != strings.ToLower(h) || strings.HasSuffix(h, ".") {
		return false
	}
	for _, label := range strings.Split(h, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
				return false
			}
		}
	}
	_, err := netip.ParseAddr(h)
	return err != nil
}

type lookuper interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

// A gateway receives its own immutable policy from the trusted Runner. It never
// resolves names through the holder's /etc/hosts or a DNS server. A later policy
// generation will use a replacement gateway, not student-controlled reloads.
type pinnedLookup struct {
	hosts     map[string][]net.IPAddr
	expiresAt int64
	deadline  time.Time
}

func parsePinSnapshot(raw string, now time.Time) (*pinnedLookup, error) {
	if len(raw) == 0 || len(raw) > 8192 {
		return nil, errors.New("invalid policy size")
	}
	var p struct {
		ExpiresAt int64               `json:"expiresAt"`
		Hosts     map[string][]string `json:"hosts"`
	}
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&p); err != nil {
		return nil, errors.New("invalid policy JSON")
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		return nil, errors.New("trailing policy JSON")
	}
	if p.ExpiresAt <= now.Unix() || p.ExpiresAt-now.Unix() > 3600 || p.ExpiresAt-now.Unix() < 10 || len(p.Hosts) != 3 {
		return nil, errors.New("invalid policy deadline or hosts")
	}
	// Subtract the same two-second guard as the independent kernel initializer.
	deadline := now.Add(time.Unix(p.ExpiresAt-2, 0).Sub(now))
	out := &pinnedLookup{hosts: make(map[string][]net.IPAddr), expiresAt: p.ExpiresAt - 2, deadline: deadline}
	for _, host := range []string{"archive.ubuntu.com", "security.ubuntu.com", "example.com"} {
		values := p.Hosts[host]
		if len(values) < 1 || len(values) > 32 {
			return nil, errors.New("invalid policy address count")
		}
		seen := make(map[string]bool)
		for _, value := range values {
			addr, err := netip.ParseAddr(value)
			if err != nil || addr.String() != value || !publicIP(addr) || seen[value] {
				return nil, errors.New("invalid policy address")
			}
			seen[value] = true
			out.hosts[host] = append(out.hosts[host], net.IPAddr{IP: net.IP(addr.AsSlice())})
		}
	}
	return out, nil
}
func (p *pinnedLookup) valid(now time.Time) bool {
	return now.Unix() < p.expiresAt && now.Before(p.deadline)
}
func (p *pinnedLookup) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !p.valid(time.Now()) || len(p.hosts[host]) == 0 {
		return nil, errors.New("policy expired or destination denied")
	}
	return p.hosts[host], nil
}

func resolvePinned(ctx context.Context, lookup lookuper, host string) (netip.Addr, error) {
	records, err := lookup.LookupIPAddr(ctx, host)
	if err != nil || len(records) == 0 {
		return netip.Addr{}, errors.New("DNS lookup unavailable")
	}
	var picked netip.Addr
	for _, rec := range records {
		addr, ok := netip.AddrFromSlice(rec.IP)
		if !ok {
			return netip.Addr{}, errors.New("invalid DNS address")
		}
		addr = addr.Unmap()
		if !addr.Is4() {
			// Public IPv6 answers are fine, but the egress bridge is IPv4-only.
			// Reject special-use IPv6 answers rather than silently overlooking them.
			if !addr.IsGlobalUnicast() {
				return netip.Addr{}, errors.New("blocked IPv6 DNS result")
			}
			for _, prefix := range denyPrefixes {
				if prefix.Contains(addr) {
					return netip.Addr{}, errors.New("blocked IPv6 DNS result")
				}
			}
			continue
		}
		if !publicIP(addr) {
			return netip.Addr{}, errors.New("blocked DNS result")
		}
		if !picked.IsValid() {
			picked = addr
		}
	}
	if !picked.IsValid() {
		return netip.Addr{}, errors.New("no approved IPv4 DNS result")
	}
	return picked, nil
}

func parseCIDR(raw string) (netip.Prefix, error) {
	prefix, err := netip.ParsePrefix(raw)
	if err != nil || !prefix.IsValid() || !prefix.Addr().Is4() || prefix.Bits() < 16 || prefix.Bits() > 28 || prefix != prefix.Masked() {
		return netip.Prefix{}, errors.New("LAB_CLIENT_CIDR must be a canonical IPv4 /16..../28 network")
	}
	if publicIP(prefix.Addr()) {
		return netip.Prefix{}, errors.New("lab CIDR must be private")
	}
	// Prevent broad classifications outside RFC1918 space.
	private := parsePrefixes([]string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"})
	for _, p := range private {
		if p.Contains(prefix.Addr()) && prefix.Bits() >= p.Bits() {
			return prefix, nil
		}
	}
	return netip.Prefix{}, errors.New("lab CIDR must be within RFC1918 space")
}

func requestHost(raw string, port int, allowed map[string]bool) (string, error) {
	host, portText, err := net.SplitHostPort(raw)
	if err != nil || portText != strconv.Itoa(port) || !validHost(host) || !allowed[host] {
		return "", errors.New("destination denied")
	}
	return host, nil
}

func parseConnect(r *http.Request) (string, error) {
	if r.Method != http.MethodConnect || r.ProtoMajor != 1 || r.RequestURI == "" || r.Host != r.RequestURI ||
		r.URL == nil || r.URL.Host != r.RequestURI || r.ContentLength > 0 || len(r.TransferEncoding) != 0 {
		return "", errors.New("noncanonical CONNECT")
	}
	return requestHost(r.RequestURI, 443, allowedCONNECT)
}

func parseGet(r *http.Request) (string, string, error) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return "", "", errors.New("method denied")
	}
	if r.ProtoMajor != 1 || len(r.TransferEncoding) != 0 || r.ContentLength > 0 || r.URL == nil ||
		r.URL.Scheme != "http" || r.URL.User != nil || r.URL.Fragment != "" || !r.URL.IsAbs() ||
		r.URL.Host != r.Host {
		return "", "", errors.New("noncanonical absolute HTTP URL")
	}
	u := r.URL
	host := u.Hostname()
	if !validHost(host) || !allowedHTTP[host] || (u.Host != host && u.Host != host+":80") ||
		(u.Port() != "" && u.Port() != "80") {
		return "", "", errors.New("destination denied")
	}
	if r.URL.RawPath != "" && r.URL.EscapedPath() != r.URL.RawPath {
		return "", "", errors.New("ambiguous path")
	}
	target := u.EscapedPath()
	if target == "" {
		target = "/"
	}
	if u.RawQuery != "" {
		target += "?" + u.RawQuery
	}
	if len(target) > 4096 {
		return "", "", errors.New("path too long")
	}
	return host, target, nil
}

type gateway struct {
	cidr   netip.Prefix
	lookup lookuper
	lease  *pinnedLookup
	dialer net.Dialer
	slots  chan struct{}
}

func (g *gateway) clientOK(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	ip, err := netip.ParseAddr(host)
	return err == nil && g.cidr.Contains(ip.Unmap())
}

func (g *gateway) resolve(ctx context.Context, host string) (netip.Addr, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return resolvePinned(ctx, g.lookup, host)
}

func (g *gateway) dialPinned(ctx context.Context, ip netip.Addr, port int) (net.Conn, error) {
	conn, err := g.dialer.DialContext(ctx, "tcp4", net.JoinHostPort(ip.String(), strconv.Itoa(port)))
	if err != nil {
		return nil, err
	}
	peer, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		conn.Close()
		return nil, errors.New("upstream peer address absent")
	}
	peerIP, valid := netip.AddrFromSlice(peer.IP)
	if !valid || peerIP.Unmap() != ip {
		conn.Close()
		return nil, errors.New("upstream peer mismatch")
	}
	return conn, nil
}

func (g *gateway) requestDeadline(max time.Duration) time.Time {
	deadline := time.Now().Add(max)
	if g.lease != nil && g.lease.deadline.Before(deadline) {
		return g.lease.deadline
	}
	return deadline
}

func (g *gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if g.lease != nil && !g.lease.valid(time.Now()) {
		http.Error(w, "policy expired", http.StatusServiceUnavailable)
		return
	}
	if r.URL != nil && r.URL.Path == "/_healthz" && r.Method == http.MethodGet {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if host == "127.0.0.1" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	if !g.clientOK(r.RemoteAddr) {
		http.Error(w, "client denied", http.StatusForbidden)
		return
	}
	select {
	case g.slots <- struct{}{}:
		defer func() { <-g.slots }()
	default:
		http.Error(w, "busy", http.StatusServiceUnavailable)
		return
	}
	if r.Header.Get("Upgrade") != "" || r.Header.Get("Proxy-Authorization") != "" {
		http.Error(w, "unsupported headers", http.StatusForbidden)
		return
	}
	if r.Method == http.MethodConnect {
		g.connect(w, r)
		return
	}
	g.forwardHTTP(w, r)
}

func (g *gateway) connect(w http.ResponseWriter, r *http.Request) {
	host, err := parseConnect(r)
	if err != nil {
		http.Error(w, "CONNECT denied", http.StatusForbidden)
		return
	}
	ip, err := g.resolve(r.Context(), host)
	if err != nil {
		http.Error(w, "upstream address denied", http.StatusForbidden)
		return
	}
	ctx, cancel := context.WithDeadline(r.Context(), g.requestDeadline(5*time.Second))
	upstream, err := g.dialPinned(ctx, ip, 443)
	cancel()
	if err != nil {
		http.Error(w, "upstream failed", http.StatusBadGateway)
		return
	}
	defer upstream.Close()
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "tunnel unsupported", http.StatusInternalServerError)
		return
	}
	client, rw, err := hijacker.Hijack()
	if err != nil {
		return
	}
	defer client.Close()
	if rw.Reader.Buffered() != 0 {
		return
	} // Disallow pre-sent tunnel payload.
	if _, err = io.WriteString(client, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		return
	}
	deadline := g.requestDeadline(maxTunnelSeconds * time.Second)
	client.SetDeadline(deadline)
	upstream.SetDeadline(deadline)
	finished := make(chan struct{}, 2)
	copyBounded := func(dst net.Conn, src net.Conn) {
		_, _ = io.CopyN(dst, src, maxDirectionBytes)
		finished <- struct{}{}
	}
	go copyBounded(upstream, client)
	go copyBounded(client, upstream)
	<-finished
	client.Close()
	upstream.Close()
	<-finished
	log.Printf("egress method=CONNECT outcome=closed host=%s", host)
}

func (g *gateway) forwardHTTP(w http.ResponseWriter, r *http.Request) {
	host, path, err := parseGet(r)
	if err != nil {
		http.Error(w, "HTTP request denied", http.StatusForbidden)
		return
	}
	ip, err := g.resolve(r.Context(), host)
	if err != nil {
		http.Error(w, "upstream address denied", http.StatusForbidden)
		return
	}
	ctx, cancel := context.WithDeadline(r.Context(), g.requestDeadline(20*time.Second))
	defer cancel()
	// The transport sends the logical Host but dials only the validated address.
	req, err := http.NewRequestWithContext(ctx, r.Method, "http://"+host+path, nil)
	if err != nil {
		http.Error(w, "invalid request", http.StatusForbidden)
		return
	}
	req.Host = host
	for _, key := range []string{"User-Agent", "Accept", "Range", "If-Modified-Since", "If-None-Match"} {
		if val := r.Header.Get(key); val != "" {
			req.Header.Set(key, val)
		}
	}
	tr := &http.Transport{Proxy: nil, DisableKeepAlives: true, ForceAttemptHTTP2: false,
		MaxIdleConns: 0, DisableCompression: true,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if address != net.JoinHostPort(host, "80") {
				return nil, errors.New("unapproved dial address")
			}
			return g.dialPinned(ctx, ip, 80)
		},
	}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.ContentLength > maxHTTPResponseBytes {
		http.Error(w, "response exceeds gateway size limit", http.StatusBadGateway)
		return
	}
	for _, key := range []string{"Content-Type", "Content-Length", "Last-Modified", "ETag", "Location", "Accept-Ranges", "Content-Range"} {
		for _, value := range resp.Header.Values(key) {
			w.Header().Add(key, value)
		}
	}
	w.Header().Set("Connection", "close")
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	_, err = io.Copy(w, io.LimitReader(resp.Body, maxHTTPResponseBytes+1))
	if err != nil {
		log.Printf("egress method=HTTP outcome=read-error host=%s", host)
	}
	log.Printf("egress method=HTTP outcome=complete host=%s status=%d", host, resp.StatusCode)
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--healthcheck" {
		client := &http.Client{Timeout: time.Second}
		resp, err := client.Get("http://127.0.0.1:3128/_healthz")
		if err != nil {
			os.Exit(1)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNoContent {
			os.Exit(1)
		}
		return
	}
	if len(os.Args) != 1 {
		log.Fatal("unsupported arguments")
	}
	cidr, err := parseCIDR(os.Getenv("LAB_CLIENT_CIDR"))
	if err != nil {
		log.Fatalf("fail-closed gateway configuration: %s", err)
	}
	pins, err := parsePinSnapshot(os.Getenv("LAB_EGRESS_PINS_JSON"), time.Now())
	if err != nil {
		log.Fatal("fail-closed gateway policy configuration")
	}
	g := &gateway{cidr: cidr, lookup: pins, lease: pins,
		dialer: net.Dialer{Timeout: 5 * time.Second, KeepAlive: -1},
		slots:  make(chan struct{}, maxConcurrent)}
	server := &http.Server{Addr: listenAddr, Handler: g,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		IdleTimeout: 2 * time.Second, MaxHeaderBytes: 16 << 10,
		ErrorLog: log.New(os.Stderr, "gateway: ", log.LstdFlags)}
	log.Printf("phase2c8b2a supervised pinned gateway ready; labCIDR=%s", cidr.String())
	log.Fatal(server.ListenAndServe())
}
