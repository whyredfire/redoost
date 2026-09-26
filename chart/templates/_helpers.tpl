{{- define "redoost.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Uses the release name alone when it already contains the chart name
*/}}
{{- define "redoost.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "redoost.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "redoost.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "redoost.selectorLabels" -}}
app.kubernetes.io/name: {{ include "redoost.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Image reference from {repository, tag}, defaulting the tag to the app version
*/}}
{{- define "redoost.image" -}}
{{- printf "%s:%s" .image.repository (.image.tag | default .context.Chart.AppVersion) }}
{{- end }}

{{- define "redoost.secretName" -}}
{{- .Values.s3.existingSecret | default (printf "%s-s3" (include "redoost.fullname" .)) }}
{{- end }}

{{- define "redoost.podSecurityContext" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "redoost.securityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end }}

{{/*
Settings shared by the API, its migrations, and the bucket setup Job
*/}}
{{- define "redoost.apiEnvFrom" -}}
- configMapRef:
    name: {{ include "redoost.fullname" . }}-api
- secretRef:
    name: {{ include "redoost.secretName" . }}
{{- end }}

{{/*
Keeps pods that use the SQLite volume on the same node as the API
*/}}
{{- define "redoost.apiAffinity" -}}
podAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          {{- include "redoost.selectorLabels" . | nindent 10 }}
          app.kubernetes.io/component: api
      topologyKey: kubernetes.io/hostname
{{- end }}

{{/*
Port of a host:port string, or the given default when there is none
*/}}
{{- define "redoost.port" -}}
{{- $port := regexFind "[0-9]+$" (regexFind ":[0-9]+$" .host) }}
{{- $port | default .default }}
{{- end }}

{{/*
Egress rule for cluster DNS
*/}}
{{- define "redoost.dnsEgress" -}}
- to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
  ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
{{- end }}

{{- define "redoost.s3Port" -}}
{{- $s3 := urlParse .Values.s3.endpoint }}
{{- include "redoost.port" (dict "host" $s3.host "default" (ternary "443" "80" (eq $s3.scheme "https"))) }}
{{- end }}

{{- define "redoost.websitePort" -}}
{{- include "redoost.port" (dict "host" .Values.s3.websiteUpstream "default" "80") }}
{{- end }}
