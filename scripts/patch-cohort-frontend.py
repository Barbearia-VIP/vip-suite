with open('/home/ubuntu/vip-suite/client/src/pages/data-vip/RaioXPage.tsx', 'r') as f:
    content = f.read()

old = '''        <TabsContent value="cohort" className="space-y-4 mt-4">
          {qCohort.isLoading ? <Skeleton className="h-40" /> : qCohort.data ? (
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cohort por Mês de Entrada (últimos 12 meses)</CardTitle>
                <p className="text-xs text-muted-foreground">Retenção e fidelização por coorte de primeira visita</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left p-3">Coorte</th>
                      <th className="text-right p-3">Entrada</th>
                      <th className="text-right p-3">Voltaram</th>
                      <th className="text-right p-3">Retenção</th>
                      <th className="text-right p-3">Fidelizados</th>
                      <th className="text-right p-3">Fidelização</th>
                      <th className="text-right p-3">Média Visitas</th>
                      <th className="text-right p-3">Ticket Médio</th>
                    </tr></thead>
                    <tbody>
                      {qCohort.data.cohorts.map(c => (
                        <tr key={c.cohort} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium">{fmtMes(c.cohort)}</td>
                          <td className="p-3 text-right">{c.totalEntrada}</td>
                          <td className="p-3 text-right">{c.voltaram}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaRetencao >= 30 ? "text-green-400" : c.taxaRetencao >= 15 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaRetencao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.fidelizados}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaFidelizacao >= 20 ? "text-green-400" : c.taxaFidelizacao >= 10 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaFidelizacao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.mediaVisitas}</td>
                          <td className="p-3 text-right">{fmtMoeda(c.mediaGasto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {qCohort.data.cohorts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Dados insuficientes para análise de cohort.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>'''

new = '''        <TabsContent value="cohort" className="space-y-4 mt-4">
          {/* Cabeçalho informativo */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-yellow-400">📅</span>
            <span>Período: {formatDate(periodoInicio)} – {formatDate(periodoFim)} · Cohort = clientes agrupados pelo mês da 1ª visita</span>
          </div>

          {qCohort.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-48" />
              <Skeleton className="h-40" />
            </div>
          ) : !qCohort.data || (!qCohort.data.analiseNovos && qCohort.data.cohortMensal.length === 0) ? (
            <Card className="bg-card/60 border-border/50">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Sem dados de cohort para o período selecionado.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Análise de Clientes Novos ── */}
              {qCohort.data.analiseNovos && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Análise de Clientes Novos</h3>
                    <span className="text-xs text-muted-foreground">retenção e fidelização</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Novos */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>👤</span> Novos
                        </p>
                        <p className="text-2xl font-bold text-foreground">{qCohort.data.analiseNovos.novos}</p>
                        <p className="text-xs text-muted-foreground mt-1">Primeira visita no período</p>
                      </CardContent>
                    </Card>
                    {/* % Novos */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>%</span> % Novos
                        </p>
                        <p className="text-2xl font-bold text-foreground">{qCohort.data.analiseNovos.pctNovos}%</p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.novos} novos em base do período</p>
                      </CardContent>
                    </Card>
                    {/* Retenção 30d */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>🔄</span> Retenção 30d
                        </p>
                        <p className={`text-2xl font-bold ${qCohort.data.analiseNovos.pctRetencao30 >= 25 ? "text-green-400" : qCohort.data.analiseNovos.pctRetencao30 >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                          {qCohort.data.analiseNovos.pctRetencao30}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.retencao30} de {qCohort.data.analiseNovos.novos} voltaram em 30d</p>
                      </CardContent>
                    </Card>
                    {/* % Recorrentes 60d */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>⏱</span> % Recorrentes 60d
                        </p>
                        <p className={`text-2xl font-bold ${qCohort.data.analiseNovos.pctRecorrentes60 >= 35 ? "text-green-400" : qCohort.data.analiseNovos.pctRecorrentes60 >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                          {qCohort.data.analiseNovos.pctRecorrentes60}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.recorrentes60} vieram 2+ vezes em 60d</p>
                      </CardContent>
                    </Card>
                    {/* Tempo mediano 2ª visita */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>⏱</span> Tempo mediano 2ª visita
                        </p>
                        <p className="text-2xl font-bold text-foreground">
                          {qCohort.data.analiseNovos.mediana2aVisita !== null ? `${qCohort.data.analiseNovos.mediana2aVisita}d` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Metade voltou em até {qCohort.data.analiseNovos.mediana2aVisita ?? "?"}d</p>
                      </CardContent>
                    </Card>
                    {/* Ticket 1ª visita */}
                    <Card className="bg-card/60 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>$</span> Ticket 1ª visita
                        </p>
                        <p className="text-2xl font-bold text-foreground">{fmtMoeda(qCohort.data.analiseNovos.ticketMedio1aVisita)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Gasto médio na 1ª visita</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* ── Distribuição de Retenção de Novos ── */}
              {qCohort.data.distribuicao && (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Distribuição de Retenção de Novos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Barra proporcional colorida */}
                    {(() => {
                      const d = qCohort.data!.distribuicao!;
                      const total = d.total || 1;
                      const segments = [
                        { pct: d.pctRetornou30, color: "bg-green-500", label: "≤30d" },
                        { pct: d.pctRetornou31_45, color: "bg-cyan-400", label: "31-45d" },
                        { pct: d.pctRetornou46_60, color: "bg-yellow-400", label: "46-60d" },
                        { pct: d.pctAguardando, color: "bg-blue-400", label: "Aguardando" },
                        { pct: d.pctNaoRetornou30, color: "bg-orange-400", label: "Não ret >30d" },
                        { pct: d.pctNaoRetornou60, color: "bg-red-500", label: "Não ret >60d" },
                      ];
                      return (
                        <>
                          <div className="flex h-8 rounded-lg overflow-hidden w-full">
                            {segments.map((s, i) => s.pct > 0 && (
                              <div key={i} className={`${s.color} flex items-center justify-center text-xs font-bold text-white`}
                                style={{ width: `${s.pct}%` }}>
                                {s.pct >= 8 ? `${s.pct}%` : ""}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou ≤30d</p>
                                <p className="text-xs text-muted-foreground">{d.retornou30} ({d.pctRetornou30}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-cyan-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou 31-45d</p>
                                <p className="text-xs text-muted-foreground">{d.retornou31_45} ({d.pctRetornou31_45}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-yellow-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou 46-60d+</p>
                                <p className="text-xs text-muted-foreground">{d.retornou46_60} ({d.pctRetornou46_60}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Aguardando retorno</p>
                                <p className="text-xs text-muted-foreground">{d.aguardando} ({d.pctAguardando}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Não retornou &gt;30d</p>
                                <p className="text-xs text-muted-foreground">{d.naoRetornou30} ({d.pctNaoRetornou30}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Não retornou &gt;60d</p>
                                <p className="text-xs text-muted-foreground">{d.naoRetornou60} ({d.pctNaoRetornou60}%)</p>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* ── Cohort Mensal — Retenção por Dias Corridos ── */}
              {qCohort.data.cohortMensal.length > 0 && (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-3">
                    <div>
                      <CardTitle className="text-sm">Cohort Mensal — Retenção de Clientes Novos (dias corridos)</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">% de novos que retornaram em 30/60/90 dias · {formatDate(periodoInicio)} – {formatDate(periodoFim)}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Nota metodológica */}
                    <div className="mx-4 mb-3 p-3 rounded-lg bg-blue-950/40 border border-blue-800/30 text-xs text-blue-300 space-y-1">
                      <p><strong>Metodologia:</strong> Mesmos clientes novos do período. Retenção medida por <strong>dias corridos</strong> (30d = voltou em até 30 dias da 1ª visita, independente do mês).</p>
                      <p className="text-blue-400/70">O que observar: Ret. 30d alta = boa primeira impressão. Se 60d &gt;&gt; 30d, quem volta cedo fica. Se 90d &gt;&gt; 60d, clientes demoram mas eventualmente voltam.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left p-3 pl-4">Mês</th>
                            <th className="text-right p-3">Novos</th>
                            <th className="text-right p-3">Ret. 30d</th>
                            <th className="text-right p-3">Ret. 60d</th>
                            <th className="text-right p-3">Ret. 90d</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qCohort.data.cohortMensal.map(row => (
                            <tr key={row.mes} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="p-3 pl-4 font-medium">{fmtMes(row.mes)}</td>
                              <td className="p-3 text-right text-foreground">{row.novos}</td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet30 >= 25 ? "bg-green-900/50 text-green-300" : row.pctRet30 >= 15 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet30}%
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet60 >= 40 ? "bg-green-900/50 text-green-300" : row.pctRet60 >= 25 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet60}%
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet90 >= 45 ? "bg-green-900/50 text-green-300" : row.pctRet90 >= 30 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet90}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-3 pl-4 border-t border-border/30">
                      <details className="text-xs text-muted-foreground cursor-pointer">
                        <summary className="hover:text-foreground transition-colors">💬 Como ler esta tabela</summary>
                        <p className="mt-2 text-xs leading-relaxed">
                          Cada linha = clientes cuja 1ª visita histórica foi naquele mês. Ret. 30d = % que voltou em até 30 dias da 1ª visita. 
                          Ret. 60d inclui os de 30d. Ret. 90d inclui os de 60d. Valores mais altos = melhor retenção.
                        </p>
                      </details>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>'''

if old in content:
    content = content.replace(old, new, 1)
    with open('/home/ubuntu/vip-suite/client/src/pages/data-vip/RaioXPage.tsx', 'w') as f:
        f.write(content)
    print("SUCCESS: aba Cohort substituída")
else:
    print("ERROR: trecho não encontrado")
    idx = content.find('TabsContent value="cohort"')
    print(f"cohort TabsContent em linha aprox: {content[:idx].count(chr(10))+1}")
