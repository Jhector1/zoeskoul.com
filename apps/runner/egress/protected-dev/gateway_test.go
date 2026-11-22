package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

type fakeLookup struct {
	answers []string
	err     error
}

func (f fakeLookup) LookupIPAddr(_ context.Context, _ string) ([]net.IPAddr, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make([]net.IPAddr, 0, len(f.answers))
	for _, item := range f.answers {
		out = append(out, net.IPAddr{IP: net.ParseIP(item)})
	}
	return out, nil
}
func req(t *testing.T, raw string) *http.Request {
	t.Helper()
	r, err := http.ReadRequest(bufio.NewReader(strings.NewReader(raw)))
	if err != nil {
		t.Fatalf("cannot parse raw request: %v", err)
	}
	return r
}
func TestPublicIPClassification(t *testing.T) {
	for _, s := range []string{"1.1.1.1", "8.8.8.8", "93.184.215.14"} {
		if !publicIP(netip.MustParseAddr(s)) {
			t.Errorf("valid public IPv4 denied: %s", s)
		}
	}
	for _, s := range []string{"0.0.0.0", "10.0.0.1", "100.64.1.1", "127.0.0.1", "169.254.169.254", "172.16.2.3", "192.0.2.4", "192.168.1.1", "198.19.1.1", "198.51.100.2", "203.0.113.10", "224.1.1.1", "240.0.0.1", "255.255.255.255", "::1", "fe80::1", "fc00::10", "2001:db8::1", "::ffff:192.168.1.1", "2001:4860:4860::8888"} {
		if publicIP(netip.MustParseAddr(s)) {
			t.Errorf("blocked address admitted: %s", s)
		}
	}
}
func TestCIDRFailClosed(t *testing.T) {
	for _, s := range []string{"172.22.0.0/16", "10.2.3.0/24", "192.168.64.0/20"} {
		if _, err := parseCIDR(s); err != nil {
			t.Errorf("valid CIDR %s rejected: %v", s, err)
		}
	}
	for _, s := range []string{"", "0.0.0.0/0", "8.8.8.0/24", "127.0.0.0/24", "169.254.0.0/16", "100.64.0.0/16", "172.16.1.1/16", "172.15.0.0/16", "172.32.0.0/16", "172.16.0.0/12", "192.168.0.0/15", "192.168.2.0/29", "::/64"} {
		if _, err := parseCIDR(s); err == nil {
			t.Errorf("unsafe CIDR admitted: %s", s)
		}
	}
}
func TestDNSPinAndFailClosed(t *testing.T) {
	tests := []struct {
		name string
		ips  []string
		want string
		deny bool
	}{
		{"valid public", []string{"93.184.215.14", "2606:2800:220:1:248:1893:25c8:1946"}, "93.184.215.14", false},
		{"mixed metadata", []string{"93.184.215.14", "169.254.169.254"}, "", true},
		{"mixed private", []string{"93.184.215.14", "10.1.2.3"}, "", true},
		{"only IPv6", []string{"2606:2800:220:1:248:1893:25c8:1946"}, "", true},
		{"IPv6 unique local", []string{"93.184.215.14", "fd00::1"}, "", true},
		{"IPv4 mapped private", []string{"93.184.215.14", "::ffff:192.168.1.2"}, "", true},
		{"empty", nil, "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ip, err := resolvePinned(context.Background(), fakeLookup{answers: tc.ips}, "example.com")
			if tc.deny {
				if err == nil {
					t.Fatalf("unexpected DNS admission: %v", ip)
				}
				return
			}
			if err != nil || ip.String() != tc.want {
				t.Errorf("got %s err=%v, want %s", ip, err, tc.want)
			}
		})
	}
	if _, err := resolvePinned(context.Background(), fakeLookup{err: errors.New("timeout")}, "example.com"); err == nil {
		t.Fatal("DNS timeout admitted")
	}
}
func TestCONNECTStrictAuthority(t *testing.T) {
	good := req(t, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n")
	if host, err := parseConnect(good); err != nil || host != "example.com" {
		t.Fatalf("valid CONNECT refused: %q %v; url=%#v uri=%q", host, err, good.URL, good.RequestURI)
	}
	for _, target := range []string{"example.com:80", "www.example.com:443", "google.com:443", "169.254.169.254:443", "127.0.0.1:443", "EXAMPLE.com:443", "example.com.:443", "example.com:0443", "[::1]:443"} {
		r := req(t, "CONNECT "+target+" HTTP/1.1\r\nHost: "+target+"\r\n\r\n")
		if _, err := parseConnect(r); err == nil {
			t.Errorf("unapproved CONNECT target: %s", target)
		}
	}
}
func TestHTTPStrictAbsoluteTargets(t *testing.T) {
	good := req(t, "GET http://archive.ubuntu.com/ubuntu/dists/noble/InRelease HTTP/1.1\r\nHost: archive.ubuntu.com\r\n\r\n")
	host, path, err := parseGet(good)
	if err != nil || host != "archive.ubuntu.com" || path != "/ubuntu/dists/noble/InRelease" {
		t.Fatalf("valid APT request failed: %s %s %v", host, path, err)
	}
	head := req(t, "HEAD http://security.ubuntu.com/ubuntu/ HTTP/1.1\r\nHost: security.ubuntu.com\r\n\r\n")
	if _, _, err := parseGet(head); err != nil {
		t.Errorf("valid HEAD denied: %v", err)
	}
	bad := []string{
		"GET http://google.com/ HTTP/1.1\r\nHost: google.com\r\n\r\n",
		"GET http://127.0.0.1/ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
		"GET http://archive.ubuntu.com:8080/ HTTP/1.1\r\nHost: archive.ubuntu.com:8080\r\n\r\n",
		"GET https://archive.ubuntu.com/ HTTP/1.1\r\nHost: archive.ubuntu.com\r\n\r\n",
		"POST http://archive.ubuntu.com/ HTTP/1.1\r\nHost: archive.ubuntu.com\r\nContent-Length: 0\r\n\r\n",
		"GET /relative HTTP/1.1\r\nHost: archive.ubuntu.com\r\n\r\n",
	}
	for _, line := range bad {
		r := req(t, line)
		if _, _, err := parseGet(r); err == nil {
			t.Errorf("unsafe HTTP request admitted: %q", line)
		}
	}
}
func TestClientSourceGuard(t *testing.T) {
	subnet, _ := parseCIDR("172.22.0.0/16")
	g := &gateway{cidr: subnet, slots: make(chan struct{}, 8), lookup: fakeLookup{answers: []string{"93.184.215.14"}}}
	for _, tc := range []struct {
		ip    string
		allow bool
	}{{"172.22.0.7:42000", true}, {"172.21.0.7:42000", false}, {"127.0.0.1:12000", false}, {"169.254.1.1:12000", false}} {
		if g.clientOK(tc.ip) != tc.allow {
			t.Errorf("client source %s admitted=%t expected=%t", tc.ip, g.clientOK(tc.ip), tc.allow)
		}
	}
	r := httptest.NewRequest("GET", "http://google.com/", nil)
	r.RemoteAddr = "172.21.0.8:41000"
	w := httptest.NewRecorder()
	g.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Errorf("bridge client status %d, expected 403", w.Code)
	}
}
func TestClientOnlyLoopbackHealth(t *testing.T) {
	subnet, _ := parseCIDR("172.22.0.0/16")
	g := &gateway{cidr: subnet, slots: make(chan struct{}, 8), lookup: fakeLookup{answers: []string{"93.184.215.14"}}}
	for _, tc := range []struct {
		ip   string
		code int
	}{{"127.0.0.1:40000", 204}, {"172.22.0.3:40000", 403}, {"172.21.0.3:40000", 403}} {
		r := httptest.NewRequest("GET", "http://127.0.0.1/_healthz", nil)
		r.RemoteAddr = tc.ip
		w := httptest.NewRecorder()
		g.ServeHTTP(w, r)
		if w.Code != tc.code {
			t.Errorf("health from %s expected %d got %d", tc.ip, tc.code, w.Code)
		}
	}
}

func testSnapshot(expiry int64) string {
	return fmt.Sprintf(`{"expiresAt":%d,"hosts":{"archive.ubuntu.com":["185.125.190.81"],"security.ubuntu.com":["185.125.190.82"],"example.com":["93.184.215.14"]}}`, expiry)
}
func TestExplicitSnapshotLookup(t *testing.T) {
	now := time.Now()
	p, err := parsePinSnapshot(testSnapshot(now.Unix()+600), now)
	if err != nil {
		t.Fatal(err)
	}
	addr, err := resolvePinned(context.Background(), p, "example.com")
	if err != nil || addr.String() != "93.184.215.14" {
		t.Fatalf("pin mismatch %v %v", addr, err)
	}
	if _, err := p.LookupIPAddr(context.Background(), "google.com"); err == nil {
		t.Fatal("unapproved hostname")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := p.LookupIPAddr(ctx, "example.com"); err == nil {
		t.Fatal("canceled lookup")
	}
}
func TestSnapshotRejectsInvalid(t *testing.T) {
	now := time.Now()
	valid := testSnapshot(now.Unix() + 600)
	for _, raw := range []string{"", "{}", valid + "{}", testSnapshot(now.Unix() - 1), testSnapshot(now.Unix() + 3601), testSnapshot(now.Unix() + 9), strings.Replace(valid, "93.184.215.14", "169.254.169.254", 1), strings.Replace(valid, "93.184.215.14", "::1", 1), strings.Replace(valid, `"93.184.215.14"`, `"93.184.215.14","93.184.215.14"`, 1), strings.Replace(valid, `"example.com"`, `"google.com"`, 1), strings.Replace(valid, `"hosts":`, `"extra":1,"hosts":`, 1)} {
		if _, err := parsePinSnapshot(raw, now); err == nil {
			t.Fatalf("invalid policy accepted %s", raw)
		}
	}
}
func TestSnapshotExpiryAndHealth(t *testing.T) {
	now := time.Now()
	p, err := parsePinSnapshot(testSnapshot(now.Unix()+60), now)
	if err != nil {
		t.Fatal(err)
	}
	if !p.valid(now) || p.valid(now.Add(60*time.Second)) {
		t.Fatal("deadline not bounded")
	}
	// A backwards wall clock cannot extend the in-process monotonic deadline.
	p.deadline = now.Add(-time.Second)
	if p.valid(now) {
		t.Fatal("monotonic expiry not enforced")
	}
	if _, err := p.LookupIPAddr(context.Background(), "example.com"); err == nil {
		t.Fatal("expired lookup")
	}
	g := &gateway{lease: p, lookup: p}
	r := httptest.NewRequest("GET", "http://127.0.0.1/_healthz", nil)
	r.RemoteAddr = "127.0.0.1:40000"
	w := httptest.NewRecorder()
	g.ServeHTTP(w, r)
	if w.Code != 503 {
		t.Fatalf("expired gateway health %d", w.Code)
	}
	if g.requestDeadline(30 * time.Second).After(p.deadline) {
		t.Fatal("request outlives lease")
	}
}
