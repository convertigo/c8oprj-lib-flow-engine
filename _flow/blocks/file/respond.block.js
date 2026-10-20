const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Publishes a UTF-8 text attachment through Convertigo's existing .bin requester. Call last after validation; JSON/MCP calls return only the file manifest.",
  "icon": "mdi:tray-arrow-down",
  "private": false,
  "properties": {
    "content": {
      "kind": "value",
      "type": "string",
      "label": "UTF-8 text content to attach, including a CSV BOM when required",
      "default": "",
      "description": "UTF-8 text content to attach, including a CSV BOM when required."
    },
    "filename": {
      "kind": "value",
      "type": "string",
      "label": "Suggested attachment filename; controls and path separators are replaced",
      "default": "download.txt",
      "description": "Suggested attachment filename; controls and path separators are replaced."
    },
    "mimeType": {
      "kind": "value",
      "type": "string",
      "label": "Content-Type; CR/LF is refused",
      "default": "text/plain;charset=utf-8",
      "description": "Content-Type; CR/LF is refused."
    },
    "maxBytes": {
      "kind": "value",
      "type": "integer",
      "label": "Maximum UTF-8 bytes, 1 to 104857600",
      "default": 10485760,
      "description": "Maximum UTF-8 bytes, 1 to 104857600."
    },
    "status": {
      "kind": "value",
      "type": "integer",
      "default": 200,
      "label": "HTTP status",
      "description": "HTTP status 200..599 on a .bin request; use a non-2xx status for a structured error attachment."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "filename": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        },
        "size": {
          "type": "integer"
        },
        "status": {
          "type": "integer"
        }
      }
    }
  },
  "tags": [
    "file",
    "download"
  ],
  "effects": [
    "unspecified"
  ],
  "longDescription": "Use /projects/Project/.bin?__sequence=ExportFile with a Flow that calls file.respond last. Content-Type and Content-Disposition are supplied by the standard binary requester. No public temporary file or servlet write. JSON calls return the manifest, not raw file bytes.",
  "summary": "respond file {{filename}}",
  "runtime": "rhino",
  "targets": [
    "backend"
  ]
};
(function(){return {run:function(ctx,node){
 var p=ctx.props(node),content=ctx.template(p.content),name=String(ctx.template(p.filename)||"download.txt").replace(/[\u0000-\u001f\u007f/\\]/g,"_").slice(0,180),mime=String(ctx.template(p.mimeType)||"text/plain;charset=utf-8"),limit=ctx.template(p.maxBytes);
 function fail(code,message){return ctx.throwFlow({code:code,message:message,status:400},node);}
 if(typeof content!=="string")return fail("DOWNLOAD_CONTENT_INVALID","content must be text.");
 if(name==="."||name==="..")name="download.txt";
 if(/[\r\n]/.test(mime)||!/^[-\w.+]+\/[-\w.+]+(?:\s*;[^\r\n]*)?$/.test(mime))return fail("DOWNLOAD_MIME_INVALID","Use a MIME type without control characters.");
 if(!Number.isSafeInteger(limit)||limit<1||limit>104857600)return fail("DOWNLOAD_BOUNDS","maxBytes must be an integer from 1 to 104857600.");
 var bytes=new Packages.java.lang.String(content).getBytes(Packages.java.nio.charset.StandardCharsets.UTF_8);
 if(bytes.length>limit)return ctx.throwFlow({code:"DOWNLOAD_TOO_LARGE",message:"Download exceeds maxBytes.",status:413},node);
 var status=ctx.template(p.status);
 if(!Number.isSafeInteger(status)||status<200||status>599)return fail("DOWNLOAD_STATUS_INVALID","HTTP status must be an integer from 200 to 599.");
 var context=ctx.convertigoContext(),http=context.httpServletRequest;
 var binary=http!==null&&http!==undefined&&String(http.getRequestURI()).endsWith(".bin");
 if(!binary)return {filename:name,mimeType:mime,size:Number(bytes.length),status:status};
 var doc=context.outputDocument;
 if(!doc||!doc.getDocumentElement())return fail("DOWNLOAD_CONTEXT_INVALID","An active request output document is required.");
 var attachment=doc.createElement("attachment");
 attachment.setAttribute("type","attachment");attachment.setAttribute("name",name);attachment.setAttribute("content-type",mime);
 attachment.setAttribute("content-length",String(bytes.length));attachment.setAttribute("encoding","base64");
 attachment.appendChild(doc.createTextNode(String(Packages.java.util.Base64.getEncoder().encodeToString(bytes))));
 doc.getDocumentElement().appendChild(attachment);
 var ascii=name.replace(/[^\x20-\x7e]/g,"_").replace(/["\\]/g,"_");
 context.setResponseHeader("Content-Disposition",'attachment; filename="'+ascii+'"; filename*=UTF-8\'\''+encodeURIComponent(name).replace(/['()*]/g,function(c){return "%"+c.charCodeAt(0).toString(16).toUpperCase();}));
 context.setResponseStatus(status,"");
 context.setResponseHeader("Cache-Control","no-store");
 context.setResponseHeader("X-Content-Type-Options","nosniff");
 return {filename:name,mimeType:mime,size:Number(bytes.length),status:status};
}};})()
