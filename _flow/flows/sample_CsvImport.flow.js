const _flow = { accessibility:"private", description:"Parses bounded UTF-8 CSV from a project fixture or one uploaded file.", inputs:{file:{type:"string",default:"_flow/resources/csv/demo.csv",isFileUpload:true}} }
function sample_CsvImport({input,result}) {
 local.csv = csv.parse({path:input.file,separator:";",header:true,maxRows:1000,rowSchema:{type:"object",required:["id"],properties:{id:{type:"integer",title:"Identifiant"},label:{type:"string",title:"Libellé"},active:{type:"boolean",title:"Actif"},due:{type:"string",format:"date",title:"Échéance"}}}})
 result.rows = local.csv.rows
 result.count = local.csv.rowCount
}
