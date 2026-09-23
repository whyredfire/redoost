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
